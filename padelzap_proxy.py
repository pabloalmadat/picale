import httpx
import time
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

PADELZAP_API = "https://api.padelzap.com/api/v1/public"
TOURNAMENT = "98785af6-5ed7-4bfd-c912-08def727a813"
VISTAS_OK = {"grupos", "tabla-general", "partidos", "llaves"}

_cache = {}
CACHE_TTL = 15

async def _fetch_padelzap(url):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers={
            "Accept": "application/json",
            "Origin": "https://www.padelzap.com",
            "Referer": "https://www.padelzap.com/",
            "User-Agent": "Mozilla/5.0 (compatible; PicaleBot/1.0)",
        })
        r.raise_for_status()
        return r.json()

def _respuesta_completa(data, vista):
    """Verifica que la respuesta traiga los datos esperados segun la vista."""
    if not data or not data.get("success") or not data.get("data"):
        return False
    d = data["data"]
    # la vista debe estar READY
    if d.get("state") and d.get("state") != "READY":
        return False
    if vista in ("grupos", "tabla-general"):
        # debe traer el campo grupos con al menos un grupo
        g = d.get("grupos")
        return isinstance(g, list) and len(g) > 0
    if vista == "partidos":
        return "partidos" in d
    if vista == "llaves":
        return "partidos" in d
    return True

async def _fetch_con_reintento(url, vista, max_intentos=4):
    """Pide a PadelZap; si viene incompleto, reintenta (PadelZap responde inconsistente)."""
    ultimo = None
    for i in range(max_intentos):
        try:
            data = await _fetch_padelzap(url)
            ultimo = data
            if _respuesta_completa(data, vista):
                return data
        except Exception:
            pass
        await asyncio.sleep(0.4)
    return ultimo  # devuelve lo ultimo aunque este incompleto

@router.get("/{categoria_id}/{vista}")
async def proxy_vista(categoria_id: str, vista: str):
    if vista not in VISTAS_OK:
        raise HTTPException(400, "Vista no permitida")
    cache_key = categoria_id + ":" + vista
    now = time.time()
    # solo usa cache si la respuesta guardada estaba COMPLETA
    if cache_key in _cache and now - _cache[cache_key][0] < CACHE_TTL:
        cached = _cache[cache_key][1]
        if _respuesta_completa(cached, vista):
            return JSONResponse(cached)
    url = PADELZAP_API + "/tournaments/" + TOURNAMENT + "/categories/" + categoria_id + "/views/" + vista
    try:
        data = await _fetch_con_reintento(url, vista)
        # solo cachea si vino completa
        if _respuesta_completa(data, vista):
            _cache[cache_key] = (now, data)
        return JSONResponse(data)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, "PadelZap error")
    except Exception as e:
        raise HTTPException(502, "Error PadelZap: " + str(e))

CATEGORIAS = [
    "3b9f7c31-ec39-4fa8-b2d2-08def727a820",
    "b1a7107b-22e0-4e8a-b2d6-08def727a820",
    "9cfe9b43-f1b2-4a1b-b2d3-08def727a820",
    "3766e423-1b74-49d7-b2d7-08def727a820",
    "3fcc8f5f-c3ab-487c-b2d4-08def727a820",
    "5fd4c59a-d502-49c6-b2d8-08def727a820",
    "acefe85f-6a57-4431-b2d5-08def727a820",
    "d57ee80a-f1ba-4737-b2d9-08def727a820",
    "c414d4a7-3bc3-4a04-b2da-08def727a820",
]

@router.get("/todos/partidos")
async def todos_los_partidos():
    cache_key = "TODOS:partidos"
    now = time.time()
    if cache_key in _cache and now - _cache[cache_key][0] < CACHE_TTL:
        return JSONResponse(_cache[cache_key][1])
    async def una(cat):
        url = PADELZAP_API + "/tournaments/" + TOURNAMENT + "/categories/" + cat + "/views/partidos"
        try:
            return await _fetch_con_reintento(url, "partidos")
        except Exception:
            return None
    resultados = await asyncio.gather(*[una(c) for c in CATEGORIAS])
    salida = {"categorias": []}
    for cat_id, res in zip(CATEGORIAS, resultados):
        if res and res.get("success") and res.get("data"):
            d = res["data"]
            salida["categorias"].append({
                "id": cat_id,
                "nombre": (d.get("category") or {}).get("nombre", ""),
                "partidos": d.get("partidos", []),
            })
    _cache[cache_key] = (now, salida)
    return JSONResponse(salida)
