"""PÍCALE AI · worker que pide trabajos al servidor (modo "por consulta").

Sirve para correr el análisis en cualquier máquina: el VPS (lento, en CPU), una PC con
tarjeta de video o un servidor con GPU. Pide un partido, lo analiza y regresa resultados.

    PICALE_AI=https://api.picalereplay.com/ai WORKER_KEY=... python worker.py
"""
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from analyze import analyze, analyze_event

API = os.environ.get("PICALE_AI", "https://api.picalereplay.com/ai").rstrip("/")
KEY = os.environ["WORKER_KEY"]
H = {"X-Worker-Key": KEY}


def call(method, url, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(H, **({"Content-Type": "application/json"} if data else {}))
    with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=timeout) as r:
        raw = r.read()
        return (json.loads(raw) if raw else None), r.status


def run_job(job, detector=None):
    base = job["callback_base"]
    with tempfile.TemporaryDirectory() as tmp:
        video = Path(tmp) / "full.mp4"
        req = urllib.request.Request(job["video_url"], headers=H)
        with urllib.request.urlopen(req, timeout=600) as r, open(video, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        t0 = time.time()

        def progress(p):
            try:
                call("POST", f"{base}/progress", {"progress": round(p, 3)}, timeout=10)
            except Exception:
                pass

        try:
            fn = analyze_event if job.get("type") == "event" else analyze     # americana: varios partidos
            res = fn(video, job.get("calibration"), detector=detector, progress=progress)
            res["meta"]["seconds"] = round(time.time() - t0)
            call("POST", f"{base}/result", res, timeout=300)
            print(f"✓ {job['session_id'][:8]} listo en {res['meta']['seconds']} s", flush=True)
        except Exception as e:
            call("POST", f"{base}/result", {"error": f"{type(e).__name__}: {e}"}, timeout=60)
            print(f"✗ {job['session_id'][:8]}: {e}", flush=True)


def main():
    detector = None
    print(f"worker conectado a {API}", flush=True)
    while True:
        try:
            job, status = call("GET", f"{API}/worker/next")
            if status == 204 or not job:
                time.sleep(10)
                continue
            if detector is None:
                from analyze import YoloDetector
                detector = YoloDetector(os.environ.get("YOLO_WEIGHTS", "yolo11n.pt"))
            print(f"→ analizando {job['session_id'][:8]} · {job.get('court_name')}", flush=True)
            run_job(job, detector)
        except (urllib.error.URLError, OSError) as e:
            print(f"sin conexión: {e}", flush=True)
            time.sleep(15)


if __name__ == "__main__":
    sys.exit(main())
