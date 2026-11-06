"""PÍCALE AI · grabador de la mini PC del club.

Cada 3 segundos pregunta al servidor qué canchas debe grabar.
- Graba el canal MAIN de la cámara con FFmpeg, sin recodificar, en pedazos (5 min).
- Sube cada pedazo en cuanto se cierra; si no hay internet, reintenta después.
- Si se cae el internet, NO detiene la grabación: sigue hasta la hora de fin.
- Si se reinicia la PC, retoma lo pendiente al arrancar.

Uso:  python picale_rec.py            (lee picale_rec.json junto a este archivo)
Solo necesita Python 3.9+ y FFmpeg. Sin librerías extra.
"""
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
CFG = json.loads((BASE / (sys.argv[1] if len(sys.argv) > 1 else "picale_rec.json")).read_text(encoding="utf-8"))
API = CFG["api"].rstrip("/")
CLUB = CFG["club"]
KEY = CFG["edge_key"]
DATA = Path(CFG.get("data_dir", BASE / "sesiones"))
FFMPEG = CFG.get("ffmpeg", "ffmpeg")
SEG = int(CFG.get("segment_seconds", 300))
POLL = float(CFG.get("poll_seconds", 3))
COURTS = CFG["courts"]

DATA.mkdir(parents=True, exist_ok=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s",
                    handlers=[logging.StreamHandler(), logging.FileHandler(BASE / "picale_rec.log", encoding="utf-8")])
log = logging.getLogger()

procs = {}            # session_id -> subprocess.Popen
lock = threading.Lock()


def req(method, path, body=None, headers=None, data=None, timeout=20):
    h = {"X-Edge-Key": KEY, "X-Club": CLUB}
    h.update(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(API + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


# ───────────── estado en disco (para sobrevivir reinicios)

def sdir(sid):
    return DATA / sid


def load_state(sid):
    f = sdir(sid) / "state.json"
    return json.loads(f.read_text()) if f.exists() else None


def save_state(sid, st):
    d = sdir(sid)
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "state.tmp"
    tmp.write_text(json.dumps(st))
    tmp.replace(d / "state.json")


def segs(sid):
    return sorted(sdir(sid).glob("seg_*.mp4"), key=lambda p: int(p.stem.split("_")[1]))


# ───────────── grabación

def start(job):
    sid, court = job["session_id"], job["court_id"]
    cam = COURTS.get(court)
    if not cam:
        log.error("Cancha %s no está en picale_rec.json; no se puede grabar %s", court, sid)
        return
    remaining = int(job["ends_at"] - time.time())
    if remaining < 5:
        return
    st = load_state(sid) or {"court_id": court, "upload_token": job["upload_token"], "uploaded": [], "done": False, "complete": False}
    st["ends_at"] = job["ends_at"]
    st["done"] = False
    st.setdefault("stopped", False)
    save_state(sid, st)
    existing = segs(sid)
    start_n = (int(existing[-1].stem.split("_")[1]) + 1) if existing or st["uploaded"] else 0
    if st["uploaded"]:
        start_n = max(start_n, max(st["uploaded"]) + 1)
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "warning", *cam.get("input_args", ["-rtsp_transport", "tcp"]),
           "-i", cam["rtsp"], "-t", str(remaining), "-map", "0:v:0", "-c", "copy",
           "-f", "segment", "-segment_time", str(SEG), "-segment_format", "mp4",
           "-segment_start_number", str(start_n), "-reset_timestamps", "1",
           str(sdir(sid) / "seg_%03d.mp4")]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    procs[sid] = p
    log.info("▶ grabando %s · %s · %d min (pedazo %d)", cam.get("name", court), sid[:8], remaining // 60, start_n)


def stop(sid):
    p = procs.get(sid)
    if not p:
        return
    if p.poll() is None:
        try:
            p.stdin.write(b"q")
            p.stdin.flush()
            p.wait(timeout=20)
        except Exception:
            p.terminate()
    mark_stopped(sid)
    log.info("■ detenido %s", sid[:8])


def mark_stopped(sid):
    st = load_state(sid)
    if st and not st.get("stopped"):
        st["stopped"] = True
        save_state(sid, st)


def reap():
    """Marca como terminadas las grabaciones cuyo FFmpeg ya salió."""
    for sid, p in list(procs.items()):
        if p.poll() is not None:
            procs.pop(sid, None)
            st = load_state(sid)
            if st and not st["done"]:
                st["done"] = True
                if time.time() >= st.get("ends_at", 0) - 10:
                    st["stopped"] = True
                save_state(sid, st)
                log.info("✓ grabación cerrada %s (%d pedazos)", sid[:8], len(segs(sid)) + len(st["uploaded"]))


# ───────────── subida

def uploader():
    while True:
        try:
            for d in sorted(DATA.iterdir()):
                if not d.is_dir():
                    continue
                sid = d.name
                st = load_state(sid)
                if not st or st["complete"]:
                    continue
                files = segs(sid)
                running = sid in procs
                for i, f in enumerate(files):
                    n = int(f.stem.split("_")[1])
                    closed = (not running) or i < len(files) - 1
                    if not closed or n in st["uploaded"]:
                        continue
                    if f.stat().st_size == 0:
                        f.unlink()
                        continue
                    with open(f, "rb") as fh:
                        req("PUT", f"/edge/sessions/{sid}/segments/{n}", data=fh.read(),
                            headers={"X-Upload-Token": st["upload_token"], "Content-Type": "video/mp4"}, timeout=600)
                    st["uploaded"].append(n)
                    save_state(sid, st)
                    f.unlink()
                    log.info("↑ subido %s pedazo %d", sid[:8], n)
                # "complete" solo cuando la sesión terminó de verdad (no por un corte de la cámara)
                if st["done"] and st.get("stopped") and not running and not segs(sid):
                    req("POST", f"/edge/sessions/{sid}/complete", {"total": len(st["uploaded"])},
                        headers={"X-Upload-Token": st["upload_token"]})
                    st["complete"] = True
                    save_state(sid, st)
                    log.info("✓ sesión %s completa en el servidor", sid[:8])
                    shutil.rmtree(d, ignore_errors=True)
        except urllib.error.HTTPError as e:
            if e.code == 403:  # la sesión ya no existe o el token cambió: no reintentar para siempre
                log.warning("servidor rechazó una subida (403); se descarta")
                try:
                    st["complete"] = True
                    save_state(sid, st)
                except Exception:
                    pass
            else:
                log.warning("subida pendiente (HTTP %s); reintento en 15 s", e.code)
            time.sleep(15)
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            log.warning("sin conexión para subir (%s); reintento en 15 s", e)
            time.sleep(15)
        time.sleep(2)


# ───────────── ciclo principal

def hello():
    courts = {cid: {"calibration": c.get("calibration")} for cid, c in COURTS.items()}
    req("POST", "/edge/hello", {"courts": courts, "info": {"version": "1.0", "host": os.environ.get("COMPUTERNAME", "")}})
    log.info("conectado al servidor como club '%s' (%d canchas)", CLUB, len(COURTS))


def main():
    # Al arrancar: lo que quedó a medias se marca como terminado (si sigue vigente, el servidor lo vuelve a pedir)
    for d in DATA.iterdir():
        st = load_state(d.name) if d.is_dir() else None
        if st and not st["done"]:
            st["done"] = True
            save_state(d.name, st)
    threading.Thread(target=uploader, daemon=True).start()
    said_hello = False
    while True:
        try:
            if not said_hello:
                hello()
                said_hello = True
            r = req("GET", "/edge/poll")
            wanted = {j["session_id"]: j for j in r.get("record", [])}
            reap()
            for sid, job in wanted.items():
                if sid not in procs:
                    start(job)      # nueva, o se reanuda tras un corte de cámara / reinicio
            for sid in list(procs):
                if sid not in wanted:
                    stop(sid)
            for d in DATA.iterdir():  # sesiones que el servidor ya cerró mientras no grabábamos
                if d.is_dir() and d.name not in wanted and d.name not in procs:
                    mark_stopped(d.name)
            reap()
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            # Sin internet: lo que se está grabando sigue grabando.
            log.warning("sin conexión con el servidor (%s)", e)
            reap()
        time.sleep(POLL)


if __name__ == "__main__":
    main()
