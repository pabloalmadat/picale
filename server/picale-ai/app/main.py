"""PÍCALE AI · servicio de análisis de partidos completos.

Corre junto al API actual (no lo modifica). Todas las rutas viven bajo /ai.
- Jugador (Bearer del login de PÍCALE): tokens, QR, sesiones, nombres, reportes.
- Mini PC del club (X-Edge-Key): qué grabar, subir pedazos de video.
- Worker de IA (X-Worker-Key): tomar trabajos, reportar avance y resultados.
- Admin (usuario is_admin o X-Admin-Key): dar tokens, ver sesiones y clubes.
"""
import asyncio
import base64
import json
import logging
import math
import secrets
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import config as C
from . import media
from .coach import coach_summary

log = logging.getLogger("picale-ai")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

pool: asyncpg.Pool = None
http: httpx.AsyncClient = None
_me_cache: dict = {}
QUADRANTS = [
    ("A", "Cerca de la cámara · izquierda"),
    ("B", "Cerca de la cámara · derecha"),
    ("C", "Fondo · izquierda"),
    ("D", "Fondo · derecha"),
]
ACTIVE_STATES = ("recording", "naming")


def now():
    return datetime.now(timezone.utc)


def ts(d):
    return d.timestamp() if d else None


def sdir(session_id) -> Path:
    p = C.DATA_DIR / "sessions" / str(session_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


# ───────────────────────────── arranque

@asynccontextmanager
async def lifespan(app):
    global pool, http
    C.DATA_DIR.mkdir(parents=True, exist_ok=True)
    pool = await asyncpg.create_pool(C.DATABASE_URL, min_size=1, max_size=10, init=_init_conn)
    schema = (Path(__file__).resolve().parent.parent / "schema.sql").read_text()
    async with pool.acquire() as c:
        await c.execute(schema)
    http = httpx.AsyncClient(timeout=15)
    task = asyncio.create_task(housekeeping())
    log.info("PÍCALE AI listo · datos en %s · worker %s", C.DATA_DIR, "Modal" if C.MODAL_URL else "por consulta")
    yield
    task.cancel()
    await http.aclose()
    await pool.close()


async def _init_conn(conn):
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


app = FastAPI(title="PÍCALE AI", lifespan=lifespan, docs_url="/ai/docs", openapi_url="/ai/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=C.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(asyncpg.UniqueViolationError)
async def _unique(request, exc):
    return JSONResponse(status_code=409, content={"detail": "Ya hay una sesión grabándose en esta cancha o en tu cuenta."})


# ───────────────────────────── autenticación

async def current_user(authorization: str = Header(None)):
    """Valida el token con el API actual de PÍCALE (misma cuenta que la web)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Inicia sesión")
    token = authorization.split(" ", 1)[1].strip()
    hit = _me_cache.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        r = await http.get(f"{C.MAIN_API_URL}/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError:
        if hit:
            return hit[1]
        raise HTTPException(503, "No se pudo validar la sesión")
    if r.status_code != 200:
        _me_cache.pop(token, None)
        raise HTTPException(401, "Sesión vencida")
    d = r.json()
    uid = str(d.get("id") or d.get("user_id") or "")
    if not uid:
        raise HTTPException(401, "Sesión inválida")
    user = {"id": uid, "name": d.get("name"), "username": d.get("username"), "email": d.get("email"),
            "is_admin": bool(d.get("is_admin"))}
    _me_cache[token] = (time.time() + 300, user)
    async with pool.acquire() as c:
        await c.execute("""INSERT INTO ai_users (user_id, name, username, email, is_admin, last_seen)
            VALUES ($1,$2,$3,$4,$5, now()) ON CONFLICT (user_id) DO UPDATE SET
            name=EXCLUDED.name, username=EXCLUDED.username, email=EXCLUDED.email,
            is_admin=EXCLUDED.is_admin, last_seen=now()""",
                        uid, user["name"], user["username"], user["email"], user["is_admin"])
    return user


async def admin_user(authorization: str = Header(None), x_admin_key: str = Header(None)):
    if C.ADMIN_KEY and x_admin_key and secrets.compare_digest(x_admin_key, C.ADMIN_KEY):
        return {"id": "admin-key", "is_admin": True}
    user = await current_user(authorization)
    if not user["is_admin"]:
        raise HTTPException(403, "Solo administradores")
    return user


def edge_club(x_edge_key: str = Header(None), x_club: str = Header(None)):
    key = C.EDGE_KEYS.get(x_club or "")
    if not key or not x_edge_key or not secrets.compare_digest(key, x_edge_key):
        raise HTTPException(401, "Llave de club inválida")
    return x_club


def worker_auth(x_worker_key: str = Header(None)):
    if not C.WORKER_KEY or not x_worker_key or not secrets.compare_digest(C.WORKER_KEY, x_worker_key):
        raise HTTPException(401, "Llave de worker inválida")
    return True


# ───────────────────────────── tokens

async def balance(c, user_id):
    return await c.fetchval("SELECT COALESCE(SUM(delta),0) FROM ai_token_ledger WHERE user_id=$1", user_id)


@app.get("/ai/health")
async def health():
    async with pool.acquire() as c:
        await c.fetchval("SELECT 1")
    return {"ok": True}


@app.get("/ai/credits/me")
async def credits_me(user=Depends(current_user)):
    async with pool.acquire() as c:
        return {"credits": await balance(c, user["id"])}


@app.get("/ai/purchases/products")
async def products():
    return {"products": [p for p in C.PRODUCTS]}


@app.post("/ai/purchases/checkout")
async def checkout(user=Depends(current_user)):
    # Mercado Pago se conecta después; mientras, la app muestra "los tokens los da PÍCALE".
    raise HTTPException(501, "Pagos web todavía no disponibles")


# ───────────────────────────── canchas y QR

async def edge_online(c, club_id):
    last = await c.fetchval("SELECT last_seen FROM ai_edges WHERE club_id=$1", club_id)
    return bool(last and (now() - last).total_seconds() < C.EDGE_TIMEOUT_S)


async def hls_alive(url):
    if not C.CHECK_HLS or not url:
        return True
    try:
        r = await http.get(url, timeout=4)
        return r.status_code == 200 and "#EXTM3U" in r.text[:200]
    except httpx.HTTPError:
        return False


def qr_code_from(text: str):
    t = (text or "").strip()
    if "/c/" in t:
        t = t.split("/c/", 1)[1]
    return "".join(ch for ch in t.split("?")[0].split("#")[0] if ch.isalnum())


@app.post("/ai/courts/resolve-qr")
async def resolve_qr(body: dict, user=Depends(current_user)):
    code = qr_code_from(body.get("qr", ""))
    async with pool.acquire() as c:
        ct = await c.fetchrow("SELECT * FROM ai_courts WHERE qr_code=$1 AND active", code) if code else None
        if not ct:
            raise HTTPException(404, "Ese QR no es de una cancha PÍCALE")
        online = await edge_online(c, ct["club_id"])
    stream = await hls_alive(ct["hls_url"])
    return {"court_id": str(ct["id"]), "club_id": ct["club_id"], "club_name": ct["club_name"],
            "court_name": ct["court_name"], "sport": ct["sport"], "hls_url": ct["hls_url"],
            "stream_ok": online and stream, "edge_online": online, "camera_ok": stream}


# ───────────────────────────── sesiones

def tokens_for(kind, minutes):
    return 1 if kind == "match" else math.ceil(minutes / 60)


@app.post("/ai/sessions")
async def create_session(body: dict, user=Depends(current_user)):
    kind = body.get("type", "match")
    minutes = int(body.get("duration_min") or C.FULL_MATCH_MIN)
    if kind == "match":
        minutes = C.FULL_MATCH_MIN
    elif kind == "training":
        if minutes not in C.TRAINING_MINUTES:
            raise HTTPException(400, "Duración no válida")
    else:
        raise HTTPException(400, "Tipo no válido")
    cost = tokens_for(kind, minutes)
    try:
        court_id = uuid.UUID(str(body.get("court_id")))
    except ValueError:
        raise HTTPException(400, "Cancha no válida")

    async with pool.acquire() as c:
        ct = await c.fetchrow("SELECT * FROM ai_courts WHERE id=$1 AND active", court_id)
        if not ct:
            raise HTTPException(404, "Cancha no encontrada")
        if await c.fetchval("SELECT 1 FROM ai_sessions WHERE court_id=$1 AND status='recording'", court_id):
            raise HTTPException(409, "Ya hay una sesión grabándose en esta cancha.")
        if await c.fetchval("SELECT 1 FROM ai_sessions WHERE user_id=$1 AND status='recording'", user["id"]):
            raise HTTPException(409, "Ya tienes una sesión grabándose.")
        if not await edge_online(c, ct["club_id"]):
            raise HTTPException(412, "El club está sin conexión en este momento. Avisa en recepción; no se te cobró.")
    if not await hls_alive(ct["hls_url"]):
        raise HTTPException(412, "La cámara de esta cancha no está transmitiendo. No se te cobró.")

    async with pool.acquire() as c:
        async with c.transaction():
            await c.execute("SELECT pg_advisory_xact_lock(hashtext($1))", user["id"])
            if await balance(c, user["id"]) < cost:
                raise HTTPException(402, "No tienes tokens suficientes")
            sid = uuid.uuid4()
            row = await c.fetchrow("""INSERT INTO ai_sessions (id, type, user_id, court_id, tokens_spent, ends_at, upload_token)
                VALUES ($1,$2,$3,$4,$5, now() + make_interval(mins => $6), $7) RETURNING *""",
                                   sid, kind, user["id"], court_id, cost, minutes, secrets.token_urlsafe(24))
            await c.execute("INSERT INTO ai_token_ledger (user_id, delta, reason, ref) VALUES ($1,$2,'session',$3)",
                            user["id"], -cost, str(sid))
    log.info("sesión %s · %s · %s · %s tokens", sid, kind, ct["court_name"], cost)
    return session_brief(row)


def session_brief(r):
    return {"id": str(r["id"]), "type": r["type"], "status": r["status"], "court_id": str(r["court_id"]),
            "started_at": ts(r["started_at"]), "ends_at": ts(r["ends_at"]), "progress": r["progress"],
            "tokens_spent": r["tokens_spent"]}


async def own_session(c, sid, user):
    try:
        sid = uuid.UUID(str(sid))
    except ValueError:
        raise HTTPException(404, "No encontrada")
    r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
    if not r or r["user_id"] != user["id"]:
        raise HTTPException(404, "No encontrada")
    return r


@app.get("/ai/sessions/active")
async def active_session(user=Depends(current_user)):
    async with pool.acquire() as c:
        r = await c.fetchrow("""SELECT * FROM ai_sessions WHERE user_id=$1 AND status = ANY($2::text[])
            ORDER BY started_at DESC LIMIT 1""", user["id"], list(ACTIVE_STATES))
    return session_brief(r) if r else {}


async def refund(c, r, reason):
    await c.execute("""INSERT INTO ai_token_ledger (user_id, delta, reason, ref) VALUES ($1,$2,$3,$4)
        ON CONFLICT (reason, ref) DO NOTHING""", r["user_id"], r["tokens_spent"], reason, str(r["id"]))


@app.post("/ai/sessions/{sid}/finish")
async def finish_session(sid: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        r = await own_session(c, sid, user)
        if r["status"] != "recording":
            return {"status": r["status"]}
        played = (now() - r["started_at"]).total_seconds() / 60
        async with c.transaction():
            if played < C.EARLY_CANCEL_MIN:
                await c.execute("UPDATE ai_sessions SET status='cancelled', finished_at=now(), ends_at=now() WHERE id=$1", r["id"])
                await refund(c, r, "refund_early")
                return {"status": "cancelled", "refunded": r["tokens_spent"]}
            await c.execute("UPDATE ai_sessions SET status='naming', finished_at=now(), ends_at=LEAST(ends_at, now()) WHERE id=$1", r["id"])
    return {"status": "naming"}


@app.get("/ai/sessions/{sid}/snapshot")
async def snapshot(sid: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        r = await own_session(c, sid, user)
    d = sdir(r["id"])
    snap = d / "snap.jpg"
    if not snap.exists():
        segs = sorted(d.glob("seg_*.mp4"))
        if not segs:
            return {"pending": True}
        ok = await asyncio.to_thread(media.last_frame, segs[-1], snap)
        if not ok:
            return {"pending": True}
    people = [{"track_id": t, "box": None, "hint": h} for t, h in QUADRANTS]
    return {"image_url": f"{C.PUBLIC_BASE}/media/{r['id']}/snap.jpg?v={int(snap.stat().st_mtime)}", "people": people}


@app.put("/ai/sessions/{sid}/players")
async def set_players(sid: str, body: dict, user=Depends(current_user)):
    valid = {t for t, _ in QUADRANTS}
    async with pool.acquire() as c:
        r = await own_session(c, sid, user)
        if r["status"] not in ("naming", "waiting_video"):
            raise HTTPException(409, "Esta sesión ya no acepta nombres")
        async with c.transaction():
            await c.execute("DELETE FROM ai_session_players WHERE session_id=$1", r["id"])
            for p in body.get("players", []):
                tid = str(p.get("track_id", "")).upper()
                if tid not in valid:
                    continue
                uid, name, tag = None, (p.get("display_name") or "").strip()[:60] or None, None
                if p.get("me"):
                    uid, name = user["id"], user.get("name") or user.get("username") or "Yo"
                elif p.get("username"):
                    un = str(p["username"]).lstrip("@").strip()
                    found = await c.fetchrow("SELECT user_id, name FROM ai_users WHERE lower(username)=lower($1)", un)
                    if found:
                        uid, name, tag = found["user_id"], found["name"] or un, "pending"
                    else:
                        name = "@" + un
                await c.execute("""INSERT INTO ai_session_players (session_id, track_id, user_id, display_name, tag_status)
                    VALUES ($1,$2,$3,$4,$5)""", r["id"], tid, uid, name, tag)
            await c.execute("UPDATE ai_sessions SET players_named=true, status='waiting_video' WHERE id=$1", r["id"])
    asyncio.create_task(maybe_dispatch(r["id"]))
    return {"status": "queued"}


@app.get("/ai/sessions/me")
async def my_sessions(user=Depends(current_user)):
    async with pool.acquire() as c:
        rows = await c.fetch("""SELECT DISTINCT s.* FROM ai_sessions s
            LEFT JOIN ai_session_players p ON p.session_id = s.id
            WHERE (s.user_id=$1 OR p.user_id=$1) AND s.status <> 'cancelled'
            ORDER BY s.started_at DESC LIMIT 50""", user["id"])
    out = []
    for r in rows:
        b = session_brief(r)
        if b["status"] == "waiting_video":
            b["status"] = "queued"
        out.append(b)
    return {"sessions": out}


@app.get("/ai/sessions/{sid}")
async def get_session(sid: str, user=Depends(current_user)):
    try:
        sid = uuid.UUID(sid)
    except ValueError:
        raise HTTPException(404, "No encontrada")
    async with pool.acquire() as c:
        r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        players = await c.fetch("SELECT * FROM ai_session_players WHERE session_id=$1 ORDER BY track_id", sid)
    if not r:
        raise HTTPException(404, "No encontrada")
    owner = r["user_id"] == user["id"]
    if not owner and not any(p["user_id"] == user["id"] for p in players):
        raise HTTPException(404, "No encontrada")
    b = session_brief(r)
    if b["status"] == "waiting_video":
        b["status"] = "queued"
    b["is_owner"] = owner
    b["video_url"] = f"{C.PUBLIC_BASE}/media/{r['id']}/full.mp4" if r["status"] == "ready" and (sdir(r["id"]) / "full.mp4").exists() else None
    named = {p["track_id"]: p for p in players}
    res = (r["result"] or {}).get("players", {})
    ps = []
    for t, hint in QUADRANTS:
        p = named.get(t)
        if t not in res and not p:
            continue
        item = {"track_id": t, "label": t, "side_label": hint,
                "display_name": p["display_name"] if p else None,
                "is_me": bool(p and p["user_id"] == user["id"]),
                "stats": (p["stats"] if p and p["stats"] else res.get(t, {}).get("stats")),
                "heatmap_url": f"{C.PUBLIC_BASE}/media/{r['id']}/heat_{t}.png" if (sdir(r['id']) / f"heat_{t}.png").exists() else None,
                "coach_summary": p["coach_summary"] if p else None,
                "coach_note": p["coach_note"] if p else None}
        if not owner and not item["is_me"]:
            item["stats"], item["heatmap_url"], item["coach_summary"], item["coach_note"] = None, None, None, None
        ps.append(item)
    b["players"] = ps
    b["moments"] = (r["result"] or {}).get("moments", []) if r["status"] == "ready" else []
    meta = (r["result"] or {}).get("meta", {})
    b["duration_s"] = (meta["frames"] / meta["fps"]) if meta.get("frames") and meta.get("fps") else meta.get("minutes", 0) * 60
    b["clips"] = await list_clips(r["id"])
    return b


# ───────────────────────────── clips del partido completo

_cut_lock = asyncio.Semaphore(1)       # un corte a la vez para no saturar el VPS


def clip_json(sid, c):
    base = f"{C.PUBLIC_BASE}/media/{sid}/clips/{c['id']}"
    return {"id": str(c["id"]), "start": c["start_s"], "end": c["end_s"], "title": c["title"], "auto": c["auto"],
            "status": c["status"], "url": base + ".mp4" if c["status"] == "ready" else None,
            "thumbnail_url": base + ".jpg" if c["status"] == "ready" else None, "created_at": ts(c["created_at"])}


async def list_clips(sid):
    async with pool.acquire() as c:
        rows = await c.fetch("SELECT * FROM ai_clips WHERE session_id=$1 ORDER BY start_s", sid)
    return [clip_json(sid, x) for x in rows]


async def make_clip(clip_id):
    async with pool.acquire() as c:
        cl = await c.fetchrow("SELECT * FROM ai_clips WHERE id=$1", clip_id)
    d = sdir(cl["session_id"])
    video = d / "full.mp4"
    (d / "clips").mkdir(exist_ok=True)
    async with _cut_lock:
        ok = video.exists() and await asyncio.to_thread(
            media.cut_clip, video, cl["start_s"], cl["end_s"], d / "clips" / f"{clip_id}.mp4", d / "clips" / f"{clip_id}.jpg")
    async with pool.acquire() as c:
        await c.execute("UPDATE ai_clips SET status=$2 WHERE id=$1", clip_id, "ready" if ok else "failed")


async def can_see(c, sid, user):
    try:
        sid = uuid.UUID(str(sid))
    except ValueError:
        raise HTTPException(404, "No encontrada")
    r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
    if not r:
        raise HTTPException(404, "No encontrada")
    if r["user_id"] != user["id"] and not await c.fetchval(
            "SELECT 1 FROM ai_session_players WHERE session_id=$1 AND user_id=$2", sid, user["id"]):
        raise HTTPException(404, "No encontrada")
    return r


@app.get("/ai/sessions/{sid}/clips")
async def session_clips(sid: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        r = await can_see(c, sid, user)
    return {"clips": await list_clips(r["id"])}


@app.post("/ai/sessions/{sid}/clips")
async def create_clip(sid: str, body: dict, user=Depends(current_user)):
    """Editor: el jugador marca inicio y fin sobre el partido completo y se corta su clip."""
    async with pool.acquire() as c:
        r = await can_see(c, sid, user)
        if r["status"] != "ready" or not (sdir(r["id"]) / "full.mp4").exists():
            raise HTTPException(409, "El video completo ya no está disponible")
        try:
            start, end = float(body.get("start")), float(body.get("end"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Inicio y fin no válidos")
        meta = (r["result"] or {}).get("meta", {})
        dur = (meta["frames"] / meta["fps"]) if meta.get("frames") and meta.get("fps") else (meta.get("minutes") or 1e9) * 60
        if start < 0 or end > dur + 1 or end - start < 2 or end - start > C.CLIP_MAX_S:
            raise HTTPException(400, f"El clip debe estar dentro del partido y durar entre 2 y {C.CLIP_MAX_S} segundos")
        mine = await c.fetchval("SELECT count(*) FROM ai_clips WHERE session_id=$1 AND user_id=$2", r["id"], user["id"])
        if mine >= 50:
            raise HTTPException(429, "Llegaste al máximo de clips de este partido")
        title = (body.get("title") or "").strip()[:60] or f"Clip {int(start // 60)}:{int(start % 60):02d}"
        row = await c.fetchrow("""INSERT INTO ai_clips (session_id, user_id, start_s, end_s, title)
            VALUES ($1,$2,$3,$4,$5) RETURNING *""", r["id"], user["id"], start, end, title)
    asyncio.create_task(make_clip(row["id"]))
    return clip_json(r["id"], row)


@app.delete("/ai/sessions/{sid}/clips/{clip_id}")
async def delete_clip(sid: str, clip_id: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        r = await can_see(c, sid, user)
        cl = await c.fetchrow("SELECT * FROM ai_clips WHERE id=$1 AND session_id=$2", uuid.UUID(clip_id), r["id"])
        if not cl or (cl["user_id"] != user["id"] and r["user_id"] != user["id"]):
            raise HTTPException(404)
        await c.execute("DELETE FROM ai_clips WHERE id=$1", cl["id"])
    for ext in ("mp4", "jpg"):
        (sdir(r["id"]) / "clips" / f"{cl['id']}.{ext}").unlink(missing_ok=True)
    return {"ok": True}


@app.get("/ai/media/{sid}/clips/{name}")
async def clip_file(sid: str, name: str):
    stem, _, ext = name.rpartition(".")
    try:
        uuid.UUID(sid)
        uuid.UUID(stem)
    except ValueError:
        raise HTTPException(404)
    f = C.DATA_DIR / "sessions" / sid / "clips" / f"{stem}.{ext}"
    if ext not in ("mp4", "jpg") or not f.exists():
        raise HTTPException(404)
    return FileResponse(f, headers={"Cache-Control": "public, max-age=86400"})


@app.post("/ai/sessions/{sid}/players/{track_id}/report")
async def coach_report(sid: str, track_id: str, body: dict, user=Depends(current_user)):
    async with pool.acquire() as c:
        r = await own_session(c, sid, user)
        await c.execute("UPDATE ai_session_players SET coach_note=$3 WHERE session_id=$1 AND track_id=$2",
                        r["id"], track_id.upper(), (body.get("coach_note") or "")[:2000])
        p = await c.fetchrow("SELECT user_id FROM ai_session_players WHERE session_id=$1 AND track_id=$2", r["id"], track_id.upper())
    return {"delivered": bool(p and p["user_id"]), "url": f"https://picalereplay.com/ai/#/analisis/{r['id']}"}


@app.post("/ai/devices")
async def device(body: dict, user=Depends(current_user)):
    async with pool.acquire() as c:
        await c.execute("""INSERT INTO ai_devices (token, user_id, platform) VALUES ($1,$2,$3)
            ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id, updated_at=now()""",
                        str(body.get("token", ""))[:500], user["id"], str(body.get("platform", ""))[:20])
    return {"ok": True}


@app.get("/ai/media/{sid}/{name}")
async def media_file(sid: str, name: str):
    allowed = name in ("snap.jpg", "full.mp4", "calibracion.jpg") or (name.startswith("heat_") and name.endswith(".png") and len(name) == 10)
    try:
        uuid.UUID(sid)
    except ValueError:
        raise HTTPException(404)
    f = C.DATA_DIR / "sessions" / sid / name
    if not allowed or not f.exists():
        raise HTTPException(404)
    return FileResponse(f, headers={"Cache-Control": "private, max-age=3600"})


# ───────────────────────────── mini PC del club

@app.post("/ai/edge/hello")
async def edge_hello(body: dict, club=Depends(edge_club)):
    """La mini PC manda la calibración (esquinas de la cancha) de cada cámara."""
    async with pool.acquire() as c:
        for cid, info in (body.get("courts") or {}).items():
            try:
                await c.execute("UPDATE ai_courts SET calibration=$2 WHERE id=$1 AND club_id=$3",
                                uuid.UUID(cid), info.get("calibration"), club)
            except ValueError:
                continue
        await c.execute("""INSERT INTO ai_edges (club_id, last_seen, info) VALUES ($1, now(), $2)
            ON CONFLICT (club_id) DO UPDATE SET last_seen=now(), info=EXCLUDED.info""", club, body.get("info") or {})
    return {"ok": True}


@app.get("/ai/edge/poll")
async def edge_poll(club=Depends(edge_club), recording: str = ""):
    """Cada ~3 s: la mini PC pregunta qué debe estar grabando. Lo que no aparece aquí, se detiene."""
    async with pool.acquire() as c:
        await c.execute("""INSERT INTO ai_edges (club_id, last_seen) VALUES ($1, now())
            ON CONFLICT (club_id) DO UPDATE SET last_seen=now()""", club)
        rows = await c.fetch("""SELECT s.id, s.court_id, s.ends_at, s.upload_token FROM ai_sessions s
            JOIN ai_courts ct ON ct.id = s.court_id
            WHERE ct.club_id=$1 AND s.status='recording' AND s.ends_at > now()""", club)
    return {"record": [{"session_id": str(r["id"]), "court_id": str(r["court_id"]), "ends_at": ts(r["ends_at"]),
                        "upload_token": r["upload_token"]} for r in rows],
            "server_time": time.time()}


async def edge_session(c, sid, token, club):
    try:
        sid = uuid.UUID(sid)
    except ValueError:
        raise HTTPException(404)
    r = await c.fetchrow("""SELECT s.* FROM ai_sessions s JOIN ai_courts ct ON ct.id=s.court_id
        WHERE s.id=$1 AND ct.club_id=$2""", sid, club)
    if not r or not token or not secrets.compare_digest(r["upload_token"], token):
        raise HTTPException(403, "Token de subida inválido")
    return r


@app.put("/ai/edge/sessions/{sid}/segments/{n}")
async def upload_segment(sid: str, n: int, request: Request, club=Depends(edge_club), x_upload_token: str = Header(None)):
    async with pool.acquire() as c:
        r = await edge_session(c, sid, x_upload_token, club)
    if r["status"] in ("cancelled", "failed", "ready"):
        return {"ok": True, "ignored": True}
    if not 0 <= n < 1000:
        raise HTTPException(400)
    d = sdir(r["id"])
    tmp = d / f".seg_{n:03d}.part"
    with open(tmp, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
    tmp.replace(d / f"seg_{n:03d}.mp4")
    asyncio.create_task(maybe_dispatch(r["id"]))
    return {"ok": True}


@app.post("/ai/edge/sessions/{sid}/complete")
async def upload_complete(sid: str, body: dict, club=Depends(edge_club), x_upload_token: str = Header(None)):
    async with pool.acquire() as c:
        r = await edge_session(c, sid, x_upload_token, club)
        await c.execute("UPDATE ai_sessions SET segments_total=$2 WHERE id=$1", r["id"], int(body.get("total", 0)))
    asyncio.create_task(maybe_dispatch(r["id"]))
    return {"ok": True}


# ───────────────────────────── cola de análisis

_dispatching = set()


async def maybe_dispatch(sid):
    """Cuando hay nombres y llegó todo el video: une los pedazos y lo deja en la cola."""
    if sid in _dispatching:
        return
    _dispatching.add(sid)
    try:
        async with pool.acquire() as c:
            r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        if not r or r["status"] != "waiting_video" or r["segments_total"] is None:
            return
        d = sdir(sid)
        segs = sorted(d.glob("seg_*.mp4"))
        if len(segs) < r["segments_total"]:
            return
        if r["segments_total"] == 0:
            await fail(sid, "No llegó video de la cámara")
            return
        ok = await asyncio.to_thread(media.concat, segs, d / "full.mp4")
        if not ok:
            await fail(sid, "No se pudo unir el video")
            return
        for s in segs:
            s.unlink(missing_ok=True)
        async with pool.acquire() as c:
            await c.execute("UPDATE ai_sessions SET video_ready=true, status='queued' WHERE id=$1", sid)
        log.info("sesión %s en cola", sid)
        if C.MODAL_URL:
            await push_to_modal(sid)
    finally:
        _dispatching.discard(sid)


async def job_payload(c, r):
    ct = await c.fetchrow("SELECT * FROM ai_courts WHERE id=$1", r["court_id"])
    names = await c.fetch("SELECT track_id, display_name FROM ai_session_players WHERE session_id=$1", r["id"])
    return {"session_id": str(r["id"]), "type": r["type"],
            "video_url": f"{C.PUBLIC_BASE}/worker/video/{r['id']}",
            "calibration": ct["calibration"], "court_name": f"{ct['club_name']} · {ct['court_name']}",
            "players": {n["track_id"]: n["display_name"] for n in names},
            "callback_base": f"{C.PUBLIC_BASE}/worker/{r['id']}"}


async def push_to_modal(sid):
    async with pool.acquire() as c:
        r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        job = await job_payload(c, r)
        await c.execute("UPDATE ai_sessions SET status='processing', progress=0 WHERE id=$1", sid)
    try:
        resp = await http.post(C.MODAL_URL, json=job, headers={"X-Worker-Key": C.WORKER_KEY or ""}, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("Modal no respondió (%s); vuelve a la cola", e)
        async with pool.acquire() as c:
            await c.execute("UPDATE ai_sessions SET status='queued' WHERE id=$1", sid)


@app.get("/ai/worker/next")
async def worker_next(ok=Depends(worker_auth)):
    async with pool.acquire() as c:
        async with c.transaction():
            r = await c.fetchrow("""SELECT * FROM ai_sessions WHERE status='queued'
                ORDER BY finished_at NULLS LAST LIMIT 1 FOR UPDATE SKIP LOCKED""")
            if not r:
                return Response(status_code=204)
            await c.execute("UPDATE ai_sessions SET status='processing', progress=0 WHERE id=$1", r["id"])
            return await job_payload(c, r)


@app.get("/ai/worker/video/{sid}")
async def worker_video(sid: str, ok=Depends(worker_auth)):
    f = C.DATA_DIR / "sessions" / str(uuid.UUID(sid)) / "full.mp4"
    if not f.exists():
        raise HTTPException(404)
    return FileResponse(f, media_type="video/mp4")


@app.post("/ai/worker/{sid}/progress")
async def worker_progress(sid: str, body: dict, ok=Depends(worker_auth)):
    async with pool.acquire() as c:
        await c.execute("UPDATE ai_sessions SET progress=$2 WHERE id=$1 AND status='processing'",
                        uuid.UUID(sid), float(body.get("progress", 0)))
    return {"ok": True}


@app.post("/ai/worker/{sid}/result")
async def worker_result(sid: str, body: dict, ok=Depends(worker_auth)):
    sid = uuid.UUID(sid)
    if body.get("error"):
        await fail(sid, str(body["error"])[:500])
        return {"ok": True}
    d = sdir(sid)
    players = body.get("players") or {}
    clean = {}
    for t, p in players.items():
        t = t.upper()
        if t not in {q for q, _ in QUADRANTS}:
            continue
        if p.get("heatmap_png_b64"):
            (d / f"heat_{t}.png").write_bytes(base64.b64decode(p["heatmap_png_b64"]))
        clean[t] = {"stats": p.get("stats") or {}}
    if body.get("calibration_review_jpg_b64"):
        (d / "calibracion.jpg").write_bytes(base64.b64decode(body["calibration_review_jpg_b64"]))
    async with pool.acquire() as c:
        r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        ct = await c.fetchrow("SELECT * FROM ai_courts WHERE id=$1", r["court_id"])
        # Calibración automática: se guarda en la cancha (la manual del launcher siempre manda)
        auto = body.get("auto_calibration")
        if isinstance(auto, dict) and auto.get("corners") and (not ct["calibration"] or (ct["calibration"] or {}).get("method") == "auto"):
            await c.execute("UPDATE ai_courts SET calibration=$2 WHERE id=$1", ct["id"], auto)
        named = {p["track_id"]: p for p in await c.fetch("SELECT * FROM ai_session_players WHERE session_id=$1", sid)}
        for t, p in clean.items():
            await c.execute("""INSERT INTO ai_session_players (session_id, track_id, stats) VALUES ($1,$2,$3)
                ON CONFLICT (session_id, track_id) DO UPDATE SET stats=EXCLUDED.stats""", sid, t, p["stats"])
        moments = [m for m in (body.get("moments") or []) if isinstance(m, dict)][:400]
        await c.execute("UPDATE ai_sessions SET result=$2, progress=1 WHERE id=$1", sid,
                        {"players": clean, "moments": moments, "meta": body.get("meta") or {}})
        # Los mejores puntos se cortan solos como clips
        top = sorted([m for m in moments if m.get("top")], key=lambda m: m["start"])[:C.AUTO_CLIPS]
        for i, m in enumerate(top, 1):
            cid = await c.fetchval("""INSERT INTO ai_clips (session_id, start_s, end_s, title, auto)
                VALUES ($1,$2,$3,$4,true) RETURNING id""", sid, float(m["start"]), float(m["end"]), f"Mejor punto {i}")
            asyncio.create_task(make_clip(cid))
    # Resumen tipo coach para cada jugador (si hay llave de Claude)
    for t, p in clean.items():
        name = named.get(t)["display_name"] if named.get(t) else None
        text = await coach_summary(http, r["type"], name, p["stats"], clean, t)
        if text:
            async with pool.acquire() as c:
                await c.execute("UPDATE ai_session_players SET coach_summary=$3 WHERE session_id=$1 AND track_id=$2", sid, t, text)
    async with pool.acquire() as c:
        await c.execute("UPDATE ai_sessions SET status='ready' WHERE id=$1", sid)
    log.info("sesión %s lista", sid)
    return {"ok": True}


async def fail(sid, why):
    async with pool.acquire() as c:
        r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        if not r or r["status"] in ("failed", "ready", "cancelled"):
            return
        async with c.transaction():
            await c.execute("UPDATE ai_sessions SET status='failed', error=$2 WHERE id=$1", sid, why)
            await refund(c, r, "refund_failed")
    log.warning("sesión %s falló: %s (tokens devueltos)", sid, why)


# ───────────────────────────── tareas de fondo

async def housekeeping():
    while True:
        try:
            async with pool.acquire() as c:
                # Se acabó el tiempo de grabación → pide nombres
                await c.execute("""UPDATE ai_sessions SET status='naming', finished_at=COALESCE(finished_at, ends_at)
                    WHERE status='recording' AND ends_at <= now()""")
                # Nadie puso nombres → se analiza como Jugador A–D
                await c.execute("""UPDATE ai_sessions SET status='waiting_video', players_named=true
                    WHERE status='naming' AND finished_at < now() - make_interval(mins => $1)""", C.NAMING_TIMEOUT_MIN)
                waiting = await c.fetch("SELECT id, finished_at FROM ai_sessions WHERE status='waiting_video'")
                # Trabajos que se quedaron "procesando" más de 3 h → vuelven a la cola una vez
                await c.execute("""UPDATE ai_sessions SET status='queued' WHERE status='processing'
                    AND finished_at < now() - interval '3 hours' AND error IS NULL""")
                old = await c.fetch("""SELECT id FROM ai_sessions WHERE status IN ('ready','failed')
                    AND finished_at < now() - make_interval(days => $1)""", C.RETENTION_DAYS)
            for o in old:
                f = C.DATA_DIR / "sessions" / str(o["id"]) / "full.mp4"
                if f.exists():
                    f.unlink()
                    log.info("video completo de %s borrado (más de %s días); los clips se quedan", o["id"], C.RETENTION_DAYS)
            for w in waiting:
                if w["finished_at"] and w["finished_at"] < now() - timedelta(minutes=C.VIDEO_TIMEOUT_MIN):
                    await fail(w["id"], "El video del club no llegó completo")
                else:
                    await maybe_dispatch(w["id"])
        except Exception:
            log.exception("housekeeping")
        await asyncio.sleep(15)


# ───────────────────────────── admin

@app.get("/ai/admin/users")
async def admin_users(q: str = "", admin=Depends(admin_user)):
    async with pool.acquire() as c:
        rows = await c.fetch("""SELECT u.*, COALESCE((SELECT SUM(delta) FROM ai_token_ledger l WHERE l.user_id=u.user_id),0) AS credits
            FROM ai_users u WHERE $1 = '' OR u.name ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%'
            ORDER BY u.last_seen DESC LIMIT 50""", q.strip())
    return {"users": [{"user_id": r["user_id"], "name": r["name"], "username": r["username"], "email": r["email"],
                       "credits": r["credits"], "last_seen": ts(r["last_seen"])} for r in rows]}


@app.post("/ai/admin/tokens")
async def admin_tokens(body: dict, admin=Depends(admin_user)):
    uid, amount = str(body.get("user_id", "")), int(body.get("amount", 0))
    if not uid or amount == 0 or abs(amount) > 100:
        raise HTTPException(400, "Datos no válidos")
    async with pool.acquire() as c:
        await c.execute("INSERT INTO ai_token_ledger (user_id, delta, reason, ref, note) VALUES ($1,$2,'admin',$3,$4)",
                        uid, amount, str(uuid.uuid4()), (body.get("note") or f"por {admin['id']}")[:200])
        return {"credits": await balance(c, uid)}


@app.get("/ai/admin/sessions")
async def admin_sessions(admin=Depends(admin_user)):
    async with pool.acquire() as c:
        rows = await c.fetch("""SELECT s.*, ct.club_name, ct.court_name, u.name AS user_name FROM ai_sessions s
            JOIN ai_courts ct ON ct.id=s.court_id LEFT JOIN ai_users u ON u.user_id=s.user_id
            ORDER BY s.started_at DESC LIMIT 100""")
        edges = await c.fetch("SELECT * FROM ai_edges ORDER BY club_id")
    def cal(r):
        f = C.DATA_DIR / "sessions" / str(r["id"]) / "calibracion.jpg"
        meta = ((r["result"] or {}).get("meta") or {}).get("calibration") or {}
        return {"calibration_url": f"{C.PUBLIC_BASE}/media/{r['id']}/calibracion.jpg" if f.exists() else None,
                "calibration": meta}
    return {"sessions": [dict(session_brief(r), court=f"{r['club_name']} · {r['court_name']}", user=r["user_name"],
                              error=r["error"], **cal(r)) for r in rows],
            "edges": [{"club_id": e["club_id"], "last_seen": ts(e["last_seen"]),
                       "online": bool(e["last_seen"] and (now() - e["last_seen"]).total_seconds() < C.EDGE_TIMEOUT_S)} for e in edges]}
