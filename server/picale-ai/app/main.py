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
from . import share as sharecard
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
        ev = await c.fetchrow("""SELECT e.id, e.title, s.status FROM ai_sessions s JOIN ai_events e ON e.id=s.event_id
            WHERE s.court_id=$1 AND s.type='event' AND s.status <> 'cancelled'
            AND s.started_at > now() - make_interval(hours => $2) ORDER BY s.started_at DESC LIMIT 1""", ct["id"], C.EVENT_LOOKBACK_H)
    stream = await hls_alive(ct["hls_url"])
    return {"court_id": str(ct["id"]), "club_id": ct["club_id"], "club_name": ct["club_name"],
            "court_name": ct["court_name"], "sport": ct["sport"], "hls_url": ct["hls_url"],
            "stream_ok": online and stream, "edge_online": online, "camera_ok": stream,
            "event": {"id": str(ev["id"]), "title": ev["title"], "live": ev["status"] == "recording"} if ev else None}


# ───────────────────────────── disco

async def disk_check(c, court_minutes, largest_minutes=None):
    """¿Cabe esta grabación? Cuenta lo que ya se está grabando. El VPS también da streaming y clips:
    si se llena el disco se cae todo, así que mejor no arrancar.
    Todo el video + una cancha extra (al unir pedazos / cortar partidos hay 2 copias, pero de una cancha a la vez)."""
    committed = await c.fetchval("""SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (ends_at - now())) / 60)), 0)
        FROM ai_sessions WHERE status='recording'""")
    largest = largest_minutes if largest_minutes is not None else court_minutes
    need_gb = (court_minutes + float(committed) + largest) * C.DISK_MB_PER_MIN / 1024 + C.DISK_RESERVE_GB
    free_gb = shutil.disk_usage(C.DATA_DIR).free / 1024 ** 3
    if free_gb < need_gb:
        log.warning("sin espacio: libres %.1f GB, se necesitan %.1f GB", free_gb, need_gb)
        raise HTTPException(507, "El servidor no tiene espacio para grabar ahora. Avisa a PÍCALE; no se cobró nada.")


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
        busy = await c.fetchrow("SELECT event_id FROM ai_sessions WHERE court_id=$1 AND status='recording'", court_id)
        if busy:
            raise HTTPException(409, "Esta cancha está grabando una americana del club; tu partido ya queda grabado ahí."
                                if busy["event_id"] else "Ya hay una sesión grabándose en esta cancha.")
        if await c.fetchval("SELECT 1 FROM ai_sessions WHERE user_id=$1 AND status='recording' AND event_id IS NULL", user["id"]):
            raise HTTPException(409, "Ya tienes una sesión grabándose.")
        if not await edge_online(c, ct["club_id"]):
            raise HTTPException(412, "El club está sin conexión en este momento. Avisa en recepción; no se te cobró.")
        await disk_check(c, minutes)
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
            AND event_id IS NULL ORDER BY started_at DESC LIMIT 1""", user["id"], list(ACTIVE_STATES))
    return session_brief(r) if r else {}


async def refund(c, r, reason):
    await c.execute("""INSERT INTO ai_token_ledger (user_id, delta, reason, ref) VALUES ($1,$2,$3,$4)
        ON CONFLICT (reason, ref) DO NOTHING""", r["payer_id"] or r["user_id"], r["tokens_spent"], reason, str(r["id"]))


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
            WHERE ((s.user_id=$1 AND s.event_id IS NULL) OR p.user_id=$1) AND s.status <> 'cancelled'
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
    b["event_id"] = str(r["event_id"]) if r["event_id"] else None
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


@app.get("/ai/media/{sid}/share/{name}")
async def share_file(sid: str, name: str):
    stem, _, ext = name.rpartition(".")
    try:
        uuid.UUID(sid)
        cid, _, track = stem.rpartition("_")
        uuid.UUID(cid)
    except ValueError:
        raise HTTPException(404)
    f = C.DATA_DIR / "sessions" / sid / "share" / f"{stem}.{ext}"
    if ext not in ("mp4", "jpg") or track not in ("A", "B", "C", "D") or not f.exists():
        raise HTTPException(404)
    return FileResponse(f, headers={"Cache-Control": "public, max-age=86400"})


# ───────────────────────────── compartir en redes (estilo Strava)

_MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
_share_jobs = set()


def _share_files(sid, clip_id, track):
    d = sdir(sid) / "share"
    stem = f"{clip_id}_{track}"
    return d / f"{stem}.mp4", d / f"{stem}.jpg", d / f"{stem}.fail"


def _share_json(sid, clip_id, track):
    mp4, jpg, fail = _share_files(sid, clip_id, track)
    if mp4.exists():
        base = f"{C.PUBLIC_BASE}/media/{sid}/share/{clip_id}_{track}"
        return {"status": "ready", "video_url": base + ".mp4", "image_url": base + ".jpg"}
    if fail.exists():
        return {"status": "failed"}
    return {"status": "processing"}


async def _share_target(c, sid, clip_id, track_id, user):
    """Sesión, clip y jugador para la tarjeta. Por default, el jugador que eres tú."""
    r = await can_see(c, sid, user)
    try:
        cid = uuid.UUID(str(clip_id))
    except ValueError:
        raise HTTPException(404, "Clip no encontrado")
    cl = await c.fetchrow("SELECT * FROM ai_clips WHERE id=$1 AND session_id=$2", cid, r["id"])
    if not cl or cl["status"] != "ready":
        raise HTTPException(404, "Clip no encontrado")
    mine = await c.fetchrow("SELECT * FROM ai_session_players WHERE session_id=$1 AND user_id=$2", r["id"], user["id"])
    if track_id and (not mine or mine["track_id"] != str(track_id).upper()):
        if r["user_id"] != user["id"]:
            raise HTTPException(403, "Solo puedes compartir tus propias estadísticas")
        p = await c.fetchrow("SELECT * FROM ai_session_players WHERE session_id=$1 AND track_id=$2", r["id"], str(track_id).upper())
    else:
        p = mine
    if not p:
        raise HTTPException(400, "Primero elige cuál jugador eres")
    return r, cl, p


@app.post("/ai/sessions/{sid}/share")
async def share_create(sid: str, body: dict, user=Depends(current_user)):
    async with pool.acquire() as c:
        r, cl, p = await _share_target(c, sid, body.get("clip_id"), body.get("track_id"), user)
        ct = await c.fetchrow("SELECT * FROM ai_courts WHERE id=$1", r["court_id"])
        ev = await c.fetchrow("SELECT title FROM ai_events WHERE id=$1", r["event_id"]) if r["event_id"] else None
    track = p["track_id"]
    out = _share_json(r["id"], cl["id"], track)
    if out["status"] == "ready":
        return out
    mp4, jpg, fail = _share_files(r["id"], cl["id"], track)
    fail.unlink(missing_ok=True)
    key = (str(r["id"]), str(cl["id"]), track)
    if key not in _share_jobs:
        _share_jobs.add(key)
        name = p["display_name"] or user.get("name") or user.get("username") or f"Jugador {track}"
        if ev:
            kicker = f"{ev['title']} · {ct['court_name']}"
        else:
            kicker = f"{'Entrenamiento' if r['type'] == 'training' else 'Partido'} · {ct['club_name']} · {ct['court_name']}"
        local = r["started_at"].astimezone(timezone(timedelta(hours=-6)))
        date_txt = f"{local.day} {_MESES[local.month - 1]} {local.year}"
        clip_dir = sdir(r["id"]) / "clips"

        async def job():
            try:
                async with _cut_lock:
                    ok = await asyncio.to_thread(sharecard.render, clip_dir / f"{cl['id']}.mp4", clip_dir / f"{cl['id']}.jpg",
                                                 mp4, jpg, name=name, kicker=kicker, clip_title=cl["title"] or "",
                                                 date_txt=date_txt, stats=p["stats"] or {})
                if not ok:
                    fail.write_text("x")
            except Exception:
                log.exception("no se pudo armar la tarjeta para compartir")
                fail.write_text("x")
            finally:
                _share_jobs.discard(key)
        asyncio.create_task(job())
    return {"status": "processing"}


@app.get("/ai/sessions/{sid}/share/{clip_id}")
async def share_status(sid: str, clip_id: str, track: str = "", user=Depends(current_user)):
    async with pool.acquire() as c:
        r, cl, p = await _share_target(c, sid, clip_id, track or None, user)
    return _share_json(r["id"], cl["id"], p["track_id"])


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
    if body.get("matches") is not None:
        return await event_result(sid, body)
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
        await save_auto_calibration(c, ct, body)
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
                await c.execute("""UPDATE ai_sessions SET finished_at=COALESCE(finished_at, ends_at),
                    status = CASE WHEN type='event' THEN 'waiting_video' ELSE 'naming' END,
                    players_named = players_named OR type='event'
                    WHERE status='recording' AND ends_at <= now()""")
                await c.execute("""UPDATE ai_events e SET finished_at=e.ends_at WHERE finished_at IS NULL AND ends_at <= now()""")
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


# ───────────────────────────── americanas (panel del club)
#
# El club elige canchas y duración → cada cancha se graba de corrido (una sesión type='event').
# La IA encuentra cada partido dentro de la grabación → una sesión type='event_match' por partido,
# con su video, foto con letras A–D, stats y mejores puntos. Cada jugador se busca y dice "este soy yo".

def club_payer(club_id):
    return f"club:{club_id}"


async def my_clubs(c, user):
    if user.get("is_admin"):
        rows = await c.fetch("SELECT club_id, MIN(club_name) AS club_name FROM ai_courts WHERE active GROUP BY club_id ORDER BY 2")
    else:
        rows = await c.fetch("""SELECT a.club_id, MIN(ct.club_name) AS club_name FROM ai_club_admins a
            JOIN ai_courts ct ON ct.club_id=a.club_id WHERE a.user_id=$1 GROUP BY a.club_id ORDER BY 2""", user["id"])
    return [{"club_id": r["club_id"], "club_name": r["club_name"]} for r in rows]


async def require_club(c, user, club_id):
    if not any(x["club_id"] == club_id for x in await my_clubs(c, user)):
        raise HTTPException(403, "No eres administrador de este club")


@app.get("/ai/me/roles")
async def me_roles(user=Depends(current_user)):
    async with pool.acquire() as c:
        return {"is_admin": user["is_admin"], "clubs": await my_clubs(c, user)}


def event_status(ev, parents):
    if ev["cancelled"]:
        return "cancelled"
    st = [p["status"] for p in parents]
    if any(s == "recording" for s in st):
        return "live"
    if any(s in ("naming", "waiting_video", "queued", "processing") for s in st):
        return "processing"
    return "ready" if any(s == "ready" for s in st) else ("failed" if st else "ready")


async def event_json(c, ev, user=None, full=True):
    parents = await c.fetch("""SELECT s.*, ct.court_name FROM ai_sessions s JOIN ai_courts ct ON ct.id=s.court_id
        WHERE s.event_id=$1 AND s.type='event' ORDER BY length(ct.court_name), ct.court_name""", ev["id"])
    out = {"id": str(ev["id"]), "club_id": ev["club_id"], "title": ev["title"],
           "started_at": ts(ev["started_at"]), "ends_at": ts(ev["ends_at"]), "finished_at": ts(ev["finished_at"]),
           "status": event_status(ev, parents), "tokens_spent": ev["tokens_spent"]}
    club = await c.fetchval("SELECT club_name FROM ai_courts WHERE club_id=$1 LIMIT 1", ev["club_id"])
    out["club_name"] = club
    if not full:
        out["courts"] = len(parents)
        return out
    kids = await c.fetch("SELECT * FROM ai_sessions WHERE event_id=$1 AND type='event_match' ORDER BY started_at", ev["id"])
    pls = await c.fetch("SELECT session_id, track_id, user_id, display_name FROM ai_session_players WHERE session_id = ANY($1::uuid[])",
                        [k["id"] for k in kids])
    by = {}
    for p in pls:
        by.setdefault(p["session_id"], []).append(p)
    uid = user["id"] if user else None
    courts = []
    for p in parents:
        matches = []
        for k in kids:
            if k["court_id"] != p["court_id"]:
                continue
            res = (k["result"] or {}).get("players", {})
            ps = [{"track_id": q["track_id"], "claimed": bool(q["user_id"]), "is_me": q["user_id"] == uid and uid is not None,
                   "name": q["display_name"] if q["user_id"] else None}
                  for q in sorted(by.get(k["id"], []), key=lambda q: q["track_id"]) if q["track_id"] in res]
            matches.append({"session_id": str(k["id"]), "start": ts(k["started_at"]), "end": ts(k["ends_at"]),
                            "snapshot_url": f"{C.PUBLIC_BASE}/media/{k['id']}/snap.jpg" if (sdir(k["id"]) / "snap.jpg").exists() else None,
                            "players": ps, "mine": any(x["is_me"] for x in ps)})
        courts.append({"court_id": str(p["court_id"]), "court_name": p["court_name"], "session_id": str(p["id"]),
                       "status": "queued" if p["status"] == "waiting_video" else p["status"],
                       "progress": p["progress"], "error": p["error"], "matches": matches})
    out["courts"] = courts
    out["claim_cost"] = C.EVENT_CLAIM_COST
    return out


@app.get("/ai/clubs/{club_id}/panel")
async def club_panel(club_id: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        await require_club(c, user, club_id)
        courts = await c.fetch("""SELECT ct.*, s.event_id AS busy_event, s.id AS busy_sid FROM ai_courts ct
            LEFT JOIN ai_sessions s ON s.court_id=ct.id AND s.status='recording'
            WHERE ct.club_id=$1 AND ct.active ORDER BY length(ct.court_name), ct.court_name""", club_id)
        evs = await c.fetch("SELECT * FROM ai_events WHERE club_id=$1 ORDER BY started_at DESC LIMIT 15", club_id)
        out = {"club_id": club_id, "club_name": courts[0]["club_name"] if courts else club_id,
               "credits": await balance(c, club_payer(club_id)), "edge_online": await edge_online(c, club_id),
               "durations": C.EVENT_DURATIONS, "tokens_per_court_hour": C.EVENT_TOKENS_PER_COURT_HOUR,
               "courts": [{"id": str(x["id"]), "court_name": x["court_name"], "busy": bool(x["busy_sid"]),
                           "busy_event": str(x["busy_event"]) if x["busy_event"] else None,
                           "calibrated": bool(x["calibration"])} for x in courts],
               "events": [await event_json(c, e, user, full=False) for e in evs]}
    return out


@app.post("/ai/clubs/{club_id}/events")
async def create_event(club_id: str, body: dict, user=Depends(current_user)):
    minutes = int(body.get("duration_min") or 0)
    if minutes not in C.EVENT_DURATIONS:
        raise HTTPException(400, "Duración no válida")
    try:
        ids = list(dict.fromkeys(uuid.UUID(str(x)) for x in body.get("court_ids") or []))
    except ValueError:
        raise HTTPException(400, "Canchas no válidas")
    if not ids:
        raise HTTPException(400, "Elige al menos una cancha")
    title = (body.get("title") or "").strip()[:80] or "Americana"
    async with pool.acquire() as c:
        await require_club(c, user, club_id)
        courts = await c.fetch("SELECT * FROM ai_courts WHERE id = ANY($1::uuid[]) AND club_id=$2 AND active", ids, club_id)
        if len(courts) != len(ids):
            raise HTTPException(400, "Alguna cancha no es de este club")
        busy = await c.fetch("""SELECT ct.court_name FROM ai_sessions s JOIN ai_courts ct ON ct.id=s.court_id
            WHERE s.court_id = ANY($1::uuid[]) AND s.status='recording'""", ids)
        if busy:
            raise HTTPException(409, "Ya están grabando: " + ", ".join(b["court_name"] for b in busy))
        if not await edge_online(c, club_id):
            raise HTTPException(412, "La mini PC del club está sin conexión. Revisa que el launcher esté abierto.")
        await disk_check(c, minutes * len(ids), minutes)
    dead = [ct["court_name"] for ct in courts if not await hls_alive(ct["hls_url"])]
    if dead:
        raise HTTPException(412, "Estas cámaras no están transmitiendo: " + ", ".join(dead))
    per_court = math.ceil(minutes / 60) * C.EVENT_TOKENS_PER_COURT_HOUR
    cost = per_court * len(ids)
    payer = club_payer(club_id)
    async with pool.acquire() as c:
        async with c.transaction():
            await c.execute("SELECT pg_advisory_xact_lock(hashtext($1))", payer)
            have = await balance(c, payer)
            if have < cost:
                raise HTTPException(402, f"El club tiene {have} tokens y esta americana necesita {cost} "
                                         f"({len(ids)} canchas × {math.ceil(minutes / 60)} h).")
            ev = await c.fetchrow("""INSERT INTO ai_events (club_id, title, created_by, ends_at, tokens_spent)
                VALUES ($1,$2,$3, now() + make_interval(mins => $4), $5) RETURNING *""", club_id, title, user["id"], minutes, cost)
            for ct in courts:
                sid = uuid.uuid4()
                await c.execute("""INSERT INTO ai_sessions (id, type, user_id, court_id, tokens_spent, ends_at, upload_token, event_id, payer_id)
                    VALUES ($1,'event',$2,$3,$4, $5, $6, $7, $8)""",
                                sid, user["id"], ct["id"], per_court, ev["ends_at"], secrets.token_urlsafe(24), ev["id"], payer)
                await c.execute("INSERT INTO ai_token_ledger (user_id, delta, reason, ref, note) VALUES ($1,$2,'session',$3,$4)",
                                payer, -per_court, str(sid), f"americana {ct['court_name']}")
        log.info("americana %s · %s · %s canchas · %s min · %s tokens", ev["id"], club_id, len(ids), minutes, cost)
        return await event_json(c, ev, user)


async def get_event_row(c, eid):
    try:
        eid = uuid.UUID(str(eid))
    except ValueError:
        raise HTTPException(404, "No encontrada")
    ev = await c.fetchrow("SELECT * FROM ai_events WHERE id=$1", eid)
    if not ev:
        raise HTTPException(404, "No encontrada")
    return ev


@app.post("/ai/events/{eid}/finish")
async def finish_event(eid: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        ev = await get_event_row(c, eid)
        await require_club(c, user, ev["club_id"])
        parents = await c.fetch("SELECT * FROM ai_sessions WHERE event_id=$1 AND type='event' AND status='recording'", ev["id"])
        async with c.transaction():
            for r in parents:
                played = (now() - r["started_at"]).total_seconds() / 60
                if played < C.EARLY_CANCEL_MIN:
                    await c.execute("UPDATE ai_sessions SET status='cancelled', finished_at=now(), ends_at=now() WHERE id=$1", r["id"])
                    await refund(c, r, "refund_early")
                else:
                    await c.execute("""UPDATE ai_sessions SET status='waiting_video', players_named=true, finished_at=now(),
                        ends_at=LEAST(ends_at, now()) WHERE id=$1""", r["id"])
            left = await c.fetchval("SELECT count(*) FROM ai_sessions WHERE event_id=$1 AND type='event' AND status<>'cancelled'", ev["id"])
            await c.execute("UPDATE ai_events SET finished_at=now(), ends_at=LEAST(ends_at, now()), cancelled=$2 WHERE id=$1",
                            ev["id"], left == 0)
        for r in parents:
            asyncio.create_task(maybe_dispatch(r["id"]))
        return await event_json(c, await get_event_row(c, eid), user)


@app.get("/ai/events")
async def recent_events(club: str = "", user=Depends(current_user)):
    """Americanas recientes (para que los jugadores se busquen)."""
    async with pool.acquire() as c:
        rows = await c.fetch("""SELECT * FROM ai_events WHERE NOT cancelled AND ($1 = '' OR club_id=$1)
            AND started_at > now() - interval '14 days' ORDER BY started_at DESC LIMIT 30""", club)
        return {"events": [await event_json(c, e, user, full=False) for e in rows]}


@app.get("/ai/events/{eid}")
async def get_event(eid: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        ev = await get_event_row(c, eid)
        out = await event_json(c, ev, user)
        out["is_club_admin"] = any(x["club_id"] == ev["club_id"] for x in await my_clubs(c, user))
        return out


@app.post("/ai/sessions/{sid}/claim")
async def claim_player(sid: str, body: dict, user=Depends(current_user)):
    """Partido de americana: el jugador dice cuál de los 4 es él."""
    tid = str(body.get("track_id", "")).upper()
    try:
        sid = uuid.UUID(sid)
    except ValueError:
        raise HTTPException(404, "No encontrado")
    async with pool.acquire() as c:
        r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        if not r or r["type"] != "event_match" or r["status"] != "ready":
            raise HTTPException(404, "No encontrado")
        if tid not in ((r["result"] or {}).get("players") or {}):
            raise HTTPException(400, "Ese jugador no está en el partido")
        name = user.get("name") or user.get("username") or "Jugador"
        async with c.transaction():
            await c.execute("SELECT pg_advisory_xact_lock(hashtext($1))", str(sid))
            p = await c.fetchrow("SELECT * FROM ai_session_players WHERE session_id=$1 AND track_id=$2", sid, tid)
            if p and p["user_id"] and p["user_id"] != user["id"]:
                raise HTTPException(409, "Ese jugador ya lo eligió alguien más. Si eres tú, avisa en recepción.")
            had = await c.fetchval("SELECT 1 FROM ai_session_players WHERE session_id=$1 AND user_id=$2", sid, user["id"])
            if C.EVENT_CLAIM_COST > 0 and not had:
                paid = await c.fetchval("SELECT 1 FROM ai_token_ledger WHERE reason='claim' AND ref=$1", f"{sid}:{user['id']}")
                if not paid:
                    await c.execute("SELECT pg_advisory_xact_lock(hashtext($1))", user["id"])
                    if await balance(c, user["id"]) < C.EVENT_CLAIM_COST:
                        raise HTTPException(402, "No tienes tokens suficientes")
                    await c.execute("INSERT INTO ai_token_ledger (user_id, delta, reason, ref) VALUES ($1,$2,'claim',$3)",
                                    user["id"], -C.EVENT_CLAIM_COST, f"{sid}:{user['id']}")
            await c.execute("""UPDATE ai_session_players SET user_id=NULL, display_name=NULL, tag_status=NULL
                WHERE session_id=$1 AND user_id=$2""", sid, user["id"])
            await c.execute("""INSERT INTO ai_session_players (session_id, track_id, user_id, display_name, tag_status)
                VALUES ($1,$2,$3,$4,'accepted') ON CONFLICT (session_id, track_id) DO UPDATE
                SET user_id=EXCLUDED.user_id, display_name=EXCLUDED.display_name, tag_status='accepted'""", sid, tid, user["id"], name)
    return {"ok": True, "session_id": str(sid), "track_id": tid}


@app.delete("/ai/sessions/{sid}/claim")
async def unclaim_player(sid: str, user=Depends(current_user)):
    async with pool.acquire() as c:
        await c.execute("""UPDATE ai_session_players SET user_id=NULL, display_name=NULL, tag_status=NULL
            WHERE session_id=$1 AND user_id=$2""", uuid.UUID(sid), user["id"])
    return {"ok": True}


async def event_result(sid, body):
    """Resultado de una cancha de americana: un partido nuevo por cada uno que encontró la IA."""
    d = sdir(sid)
    full = d / "full.mp4"
    if body.get("calibration_review_jpg_b64"):
        (d / "calibracion.jpg").write_bytes(base64.b64decode(body["calibration_review_jpg_b64"]))
    async with pool.acquire() as c:
        r = await c.fetchrow("SELECT * FROM ai_sessions WHERE id=$1", sid)
        ct = await c.fetchrow("SELECT * FROM ai_courts WHERE id=$1", r["court_id"])
        await save_auto_calibration(c, ct, body)
    matches = sorted([m for m in body.get("matches") or [] if isinstance(m, dict)], key=lambda m: float(m.get("start", 0)))[:80]
    if not matches:
        await fail(sid, "La IA no encontró partidos en la grabación (¿la cancha estuvo vacía?)")
        return {"ok": True}
    meta = body.get("meta") or {}
    fps = float(meta.get("fps") or 25)
    valid = {q for q, _ in QUADRANTS}
    children = []
    for i, m in enumerate(matches, 1):
        start, end = float(m["start"]), float(m["end"])
        kf = await asyncio.to_thread(media.keyframe_before, full, start)
        cid = uuid.uuid4()
        cd = sdir(cid)
        async with _cut_lock:
            ok = await asyncio.to_thread(media.cut_copy, full, kf, end, cd / "full.mp4")
        if not ok:
            log.warning("no se pudo cortar el partido %s de %s", i, sid)
            shutil.rmtree(cd, ignore_errors=True)
            continue
        shift = start - kf                       # la IA mide desde 'start'; el video del partido empieza en 'kf'
        clean = {}
        for t, p in (m.get("players") or {}).items():
            t = t.upper()
            if t not in valid:
                continue
            if p.get("heatmap_png_b64"):
                (cd / f"heat_{t}.png").write_bytes(base64.b64decode(p["heatmap_png_b64"]))
            clean[t] = {"stats": p.get("stats") or {}}
        if m.get("snapshot_jpg_b64"):
            (cd / "snap.jpg").write_bytes(base64.b64decode(m["snapshot_jpg_b64"]))
        moms = []
        for x in (m.get("moments") or [])[:400]:
            if isinstance(x, dict):
                moms.append(dict(x, start=round(float(x["start"]) + shift, 1), end=round(float(x["end"]) + shift, 1)))
        result = {"players": clean, "moments": moms,
                  "meta": {"fps": fps, "frames": int((end - kf) * fps), "minutes": round((end - kf) / 60, 1),
                           "match_index": i, "version": meta.get("version"), "calibration": meta.get("calibration")}}
        async with pool.acquire() as c:
            async with c.transaction():
                await c.execute("""INSERT INTO ai_sessions (id, type, user_id, court_id, tokens_spent, status, started_at, ends_at,
                    finished_at, upload_token, players_named, video_ready, progress, result, event_id, parent_id, offset_s, payer_id)
                    VALUES ($1,'event_match',$2,$3,0,'ready', $4::timestamptz + make_interval(secs => $5::float8), $4::timestamptz + make_interval(secs => $6::float8),
                    now(), $7, true, true, 1, $8, $9, $10, $5, $11)""",
                                cid, r["user_id"], r["court_id"], r["started_at"], kf, end, secrets.token_urlsafe(24), result,
                                r["event_id"], sid, r["payer_id"])
                for t, p in clean.items():
                    await c.execute("INSERT INTO ai_session_players (session_id, track_id, stats) VALUES ($1,$2,$3)", cid, t, p["stats"])
                top = sorted([x for x in moms if x.get("top")], key=lambda x: -x.get("intensity", 0))[:C.EVENT_AUTO_CLIPS]
                clip_ids = []
                for j, x in enumerate(sorted(top, key=lambda x: x["start"]), 1):
                    clip_ids.append(await c.fetchval("""INSERT INTO ai_clips (session_id, start_s, end_s, title, auto)
                        VALUES ($1,$2,$3,$4,true) RETURNING id""", cid, float(x["start"]), float(x["end"]), f"Mejor punto {j}"))
        for k in clip_ids:
            asyncio.create_task(make_clip(k))
        children.append(str(cid))
    async with pool.acquire() as c:
        await c.execute("UPDATE ai_sessions SET status='ready', progress=1, result=$2 WHERE id=$1", sid,
                        {"matches": children, "meta": meta})
    if children:
        full.unlink(missing_ok=True)             # cada partido ya tiene su video; se libera el disco
    log.info("americana %s · %s partidos", sid, len(children))
    return {"ok": True}


async def save_auto_calibration(c, ct, body):
    """Calibración automática: se guarda en la cancha (la manual del launcher siempre manda)."""
    auto = body.get("auto_calibration")
    if isinstance(auto, dict) and auto.get("corners") and (not ct["calibration"] or (ct["calibration"] or {}).get("method") == "auto"):
        await c.execute("UPDATE ai_courts SET calibration=$2 WHERE id=$1", ct["id"], auto)


# admin general: clubes, sus administradores y sus tokens

@app.get("/ai/admin/clubs")
async def admin_clubs(admin=Depends(admin_user)):
    async with pool.acquire() as c:
        clubs = await c.fetch("SELECT club_id, MIN(club_name) AS club_name, count(*) AS courts FROM ai_courts GROUP BY club_id ORDER BY 2")
        admins = await c.fetch("""SELECT a.club_id, a.user_id, u.name, u.email, u.username FROM ai_club_admins a
            LEFT JOIN ai_users u ON u.user_id=a.user_id""")
        out = []
        for cl in clubs:
            out.append({"club_id": cl["club_id"], "club_name": cl["club_name"], "courts": cl["courts"],
                        "credits": await balance(c, club_payer(cl["club_id"])),
                        "admins": [{"user_id": a["user_id"], "name": a["name"], "email": a["email"], "username": a["username"]}
                                   for a in admins if a["club_id"] == cl["club_id"]]})
    return {"clubs": out}


@app.post("/ai/admin/club-admins")
async def add_club_admin(body: dict, admin=Depends(admin_user)):
    club, who = str(body.get("club_id", "")), str(body.get("who", "")).strip().lstrip("@")
    async with pool.acquire() as c:
        if not await c.fetchval("SELECT 1 FROM ai_courts WHERE club_id=$1", club):
            raise HTTPException(404, "Club no encontrado")
        u = await c.fetchrow("SELECT * FROM ai_users WHERE lower(email)=lower($1) OR lower(username)=lower($1)", who)
        if not u:
            raise HTTPException(404, "Esa persona todavía no ha entrado a picalereplay.com/ai. Pídele que entre una vez.")
        await c.execute("INSERT INTO ai_club_admins (user_id, club_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", u["user_id"], club)
    return {"ok": True, "name": u["name"] or u["username"] or u["email"]}


@app.delete("/ai/admin/club-admins")
async def del_club_admin(club_id: str, user_id: str, admin=Depends(admin_user)):
    async with pool.acquire() as c:
        await c.execute("DELETE FROM ai_club_admins WHERE club_id=$1 AND user_id=$2", club_id, user_id)
    return {"ok": True}


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
