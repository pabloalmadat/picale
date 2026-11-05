import json
import os
from pathlib import Path


def _env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


DATABASE_URL = _env("DATABASE_URL", "postgresql://postgres@localhost:5432/picale")
# API actual de PÍCALE: se usa solo para validar el login (GET /api/v1/auth/me)
MAIN_API_URL = _env("MAIN_API_URL", "http://picale-api:8080").rstrip("/")
# URL pública de este servicio (para links de fotos, mapas de calor y video)
PUBLIC_BASE = _env("PUBLIC_BASE", "https://api.picalereplay.com/ai").rstrip("/")
DATA_DIR = Path(_env("DATA_DIR", "/data"))

# Llaves de las mini PC: "somos:llave-larga,duo:otra-llave"
EDGE_KEYS = dict(p.split(":", 1) for p in _env("EDGE_KEYS", "").split(",") if ":" in p)
ADMIN_KEY = _env("ADMIN_KEY")
WORKER_KEY = _env("WORKER_KEY")
MODAL_URL = _env("MODAL_URL")            # si está, cada partido se manda a Modal; si no, espera a un worker que lo pida

ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
CLAUDE_MODEL = _env("CLAUDE_MODEL", "claude-haiku-5-5")

CORS_ORIGINS = [o.strip() for o in _env(
    "CORS_ORIGINS",
    "https://picalereplay.com,https://www.picalereplay.com,capacitor://localhost,https://localhost,http://localhost",
).split(",") if o.strip()]

FULL_MATCH_MIN = int(_env("FULL_MATCH_MIN", "90"))
TRAINING_MINUTES = [int(x) for x in _env("TRAINING_MINUTES", "60,90,120").split(",")]
EARLY_CANCEL_MIN = float(_env("EARLY_CANCEL_MIN", "10"))
EDGE_TIMEOUT_S = int(_env("EDGE_TIMEOUT_S", "30"))
NAMING_TIMEOUT_MIN = int(_env("NAMING_TIMEOUT_MIN", "120"))   # sin nombres en 2 h → se analiza como Jugador A–D
VIDEO_TIMEOUT_MIN = int(_env("VIDEO_TIMEOUT_MIN", "180"))     # el video no llegó en 3 h → falla y devuelve tokens
CHECK_HLS = _env("CHECK_HLS", "1") == "1"

PRODUCTS = json.loads(_env("PRODUCTS_JSON", json.dumps([
    {"id": "picale_token_1", "label": "1 token", "credits": 1, "price_mxn": None},
    {"id": "picale_token_5", "label": "5 tokens", "credits": 5, "price_mxn": None},
    {"id": "picale_token_10", "label": "10 tokens · paquete coach", "credits": 10, "price_mxn": None},
])))

RETENTION_DAYS = int(_env("RETENTION_DAYS", "30"))        # el video completo se borra después; los clips se quedan
AUTO_CLIPS = int(_env("AUTO_CLIPS", "5"))                  # mejores puntos que se cortan solos
CLIP_MAX_S = int(_env("CLIP_MAX_S", "90"))
