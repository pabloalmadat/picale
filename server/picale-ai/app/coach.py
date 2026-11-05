"""Resumen tipo coach con la API de Claude, a partir de las estadísticas medidas."""
import json
import logging

from . import config as C

log = logging.getLogger("picale-ai")

SYSTEM = (
    "Eres el coach de pádel de PÍCALE. Escribes en español de México, directo y amable, "
    "en segunda persona. Solo usas los números que te dan; no inventes golpes, marcadores "
    "ni datos que no estén en el JSON. Si un dato no viene, no lo menciones. "
    "Máximo 90 palabras, dos párrafos cortos: qué hizo bien y una cosa concreta para trabajar. "
    "Sin títulos, sin viñetas, sin emojis."
)


async def coach_summary(http, kind, name, stats, all_players, track_id):
    if not C.ANTHROPIC_API_KEY or not stats:
        return None
    others = {t: p.get("stats") for t, p in all_players.items() if t != track_id}
    prompt = (
        f"Tipo de sesión: {'entrenamiento' if kind == 'training' else 'partido'}.\n"
        f"Jugador: {name or 'Jugador ' + track_id} (posición {track_id}).\n"
        f"Sus estadísticas: {json.dumps(stats, ensure_ascii=False)}\n"
        f"Los otros jugadores, para comparar: {json.dumps(others, ensure_ascii=False)}\n"
        "Unidades: distance_m metros, net_pct % del tiempo cerca de la red, max_speed_kmh km/h, "
        "active_min minutos en movimiento, minutes duración analizada."
    )
    try:
        r = await http.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": C.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": C.CLAUDE_MODEL, "max_tokens": 400, "system": SYSTEM,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=60,
        )
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text").strip() or None
    except Exception as e:  # el análisis sigue aunque falle el resumen
        log.warning("resumen de Claude falló: %s", e)
        return None
