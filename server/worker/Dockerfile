# Worker en CPU (para pruebas o si no usas Modal). Un partido de 90 min tarda ~1 h.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"
COPY analyze.py worker.py ./
CMD ["python", "worker.py"]
