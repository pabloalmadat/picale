"""PÍCALE AI en Modal (GPU por uso).

Instalar y publicar (una vez, desde tu computadora):
    pip install modal
    modal setup
    modal secret create picale-ai WORKER_KEY=<la misma del servidor>
    modal deploy modal_app.py

Modal te da una URL tipo https://<tu-usuario>--picale-ai-analizar.modal.run
→ ponla en MODAL_URL del servidor picale-ai. Cada partido se analiza en su propia GPU.
"""
import os

import modal
from fastapi import Header, HTTPException   # pip install modal fastapi

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install("ultralytics==8.3.40", "opencv-python-headless==4.10.0.84", "numpy<2.1", "pillow", "fastapi[standard]")
    .run_commands("python -c \"from ultralytics import YOLO; YOLO('yolo11n.pt')\"")   # pesos dentro de la imagen
    .add_local_python_source("analyze", "autocal", "worker")
)
app = modal.App("picale-ai", image=image)


@app.function(gpu="L4", timeout=4 * 60 * 60, secrets=[modal.Secret.from_name("picale-ai")])
def procesar(job: dict):
    os.environ.setdefault("PICALE_AI", job["callback_base"].rsplit("/worker/", 1)[0])
    from analyze import YoloDetector
    from worker import run_job
    run_job(job, YoloDetector("yolo11n.pt", device=0))


@app.function(secrets=[modal.Secret.from_name("picale-ai")])
@modal.fastapi_endpoint(method="POST")
def analizar(job: dict, x_worker_key: str = Header(default=None)):
    if not x_worker_key or x_worker_key != os.environ["WORKER_KEY"]:
        raise HTTPException(401, "Llave inválida")
    procesar.spawn(job)          # responde de inmediato; el resultado llega por callback al servidor
    return {"ok": True}
