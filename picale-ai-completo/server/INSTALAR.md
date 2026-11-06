# PÍCALE AI · instalación

Son 3 piezas. Ninguna modifica lo que ya funciona (API, streaming, botones, clips).

| Pieza | Dónde corre | Qué hace |
|---|---|---|
| `picale-ai/` | VPS (Docker) | Tokens, QR, sesiones, recibe el video, cola de análisis, reportes |
| `minipc/picale_rec.py` | Mini PC del club | Graba el canal MAIN cuando un jugador inicia y sube el video en pedazos |
| `worker/` | Modal (GPU) o el VPS (CPU) | Analiza el partido y regresa las estadísticas |

---

## 1. VPS · servicio `picale-ai`

```bash
cd /opt && git clone https://github.com/pabloalmadat/picale.git picale-repo   # o git pull si ya lo tienes
cp -r picale-repo/server/picale-ai /opt/picale-ai && cd /opt/picale-ai
cp .env.example .env
openssl rand -hex 24      # corre esto 3 veces: llave de Somos, admin y worker
nano .env                 # llena DATABASE_URL y las 3 llaves
```

**Paso 2 · la red de Docker.** Busca la red donde está tu API:

```bash
docker inspect picale-api --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}'
```

Pon ese nombre en `docker-compose.yml` donde dice `RED_DE_PICALE`. En `.env`, `DATABASE_URL` usa el mismo usuario, clave y base que tu API (el host es `picale-db`).

```bash
docker compose up -d --build
docker logs -f picale-ai          # debe decir "PÍCALE AI listo"
```

Al arrancar crea sus tablas (`ai_…`). Después carga las canchas de Somos con sus QR:

```bash
docker exec -i picale-db psql -U USUARIO NOMBRE_DB < seed_somos.sql
```

**Paso 3 · publicar `/ai` en `api.picalereplay.com`.** Todo lo que empiece con `/ai/` va al contenedor `picale-ai` en el puerto 8090. Depende de qué recibe el tráfico de `api.picalereplay.com` (con la salida de `docker ps` te digo cuál es):

*Nginx:*
```nginx
location /ai/ {
    proxy_pass http://picale-ai:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 300m;        # cada pedazo de 5 min en MAIN pesa ~100 MB
    proxy_request_buffering off;
    proxy_read_timeout 600s;
}
```

*Caddy:*
```
handle /ai/* {
    reverse_proxy picale-ai:8090
}
```

Prueba: `curl https://api.picalereplay.com/ai/health` → `{"ok":true}`.

---

## 2. Mini PC de Somos · grabador

1. Copia la carpeta `minipc` a `C:\picale\ai\`.
2. Copia `picale_rec.example.json` como `picale_rec.json` y llena:
   - `edge_key`: la llave de Somos que pusiste en `EDGE_KEYS`.
   - `rtsp` de cada cancha: las mismas URLs que usa `picale_somos.py`, **canal 101 (MAIN)**.
   - `calibration` (opcional pero mejora la precisión): las 4 esquinas de la cancha en píxeles del video MAIN, en este orden: cerca-izquierda, cerca-derecha, fondo-derecha, fondo-izquierda.
     `{"corners": [[x,y],[x,y],[x,y],[x,y]], "width": 2560, "height": 1440}`
3. Prueba a mano:
   ```
   cd C:\picale\ai
   python picale_rec.py
   ```
   Debe decir `conectado al servidor como club 'somos' (8 canchas)`.
4. Para que arranque solo: Programador de tareas de Windows → "Al iniciar sesión" → `python C:\picale\ai\picale_rec.py`.

Corre al mismo tiempo que `picale_somos.py`; usan la cámara por separado. El video espera en `C:\picale\sesiones` hasta subirse y luego se borra.

---

## 3. Análisis · worker

**Opción A · Modal (recomendada, GPU por uso):**
```bash
cd worker
pip install modal fastapi
modal setup
modal secret create picale-ai WORKER_KEY=<la misma llave de worker>
modal deploy modal_app.py
```
Copia la URL que termina en `-analizar.modal.run` a `MODAL_URL` en `.env` y reinicia: `docker compose up -d`.

**Opción B · en el VPS con CPU (para el primer día de pruebas):**
```bash
cd /opt/picale-repo/server/worker
docker build -t picale-ai-worker .
docker run -d --name picale-ai-worker --restart unless-stopped --network RED_DE_PICALE \
  -e PICALE_AI=http://picale-ai:8090/ai -e WORKER_KEY=<llave de worker> picale-ai-worker
```
Tarda ~1 h por partido de 90 min. Si `MODAL_URL` está vacío, los partidos esperan a este worker.

---

## 4. Probar el flujo completo

1. Entra a picalereplay.com con tu cuenta (admin) → `picalereplay.com/ai` → **Perfil → Panel PÍCALE AI**.
   - En *Clubes* debe salir **somos · Mini PC en línea**.
   - Busca tu nombre y dale **+5** tokens.
2. En la cancha: escanea el QR → **Usar 1 token** → confirma la cancha → **Iniciar partido**.
3. Juega al menos 10 minutos (antes de eso, "Fin del juego" cancela y devuelve el token).
4. **Fin del juego** → nombra a los jugadores → **Analizar partido**.
5. En el panel, la sesión pasa por *Recibiendo video → En cola → Analizando → Listo*.

Si algo falla, el token se devuelve solo y el panel muestra el motivo.

## 5. Cuando todo funcione

En `index.html`, cambia `var AI_STATUS = 'proximamente';` por `'beta'` para que la landing invite a probarlo.

## Qué incluye esta versión (beta)

- **Clips automáticos:** la IA corta el partido en puntos (por la actividad de los 4 jugadores) y los 5 más intensos se convierten solos en clips. Todos los puntos quedan marcados en la línea de tiempo.
- **Editor:** desde el partido completo, el jugador marca inicio y fin y se corta su clip (2 a 90 s, en H.264 para cualquier celular).
- **Estadísticas por jugador:** distancia, minutos en movimiento, % cerca de la red, velocidad máxima, mapa de calor y resumen tipo coach (si hay `ANTHROPIC_API_KEY`).
- **Siguiente versión:** tipo de golpe por clip, pasando el clasificador de `picale_ai_pro.py` a `worker/analyze.py`.

## Espacio en disco

Un partido de 90 min en MAIN pesa ~1.7 GB. El video completo se borra a los `RETENTION_DAYS` (30 por defecto); los clips (~5–15 MB cada uno) se quedan. Con 8 canchas y varios partidos al día el disco del VPS se llena rápido: revisa `df -h` la primera semana y, si hace falta, baja `RETENTION_DAYS` o agrega un volumen de Hetzner montado en `./data`.

Los clips del editor se cortan en el VPS (uno a la vez). Si las cámaras graban el MAIN en H.265, el partido completo puede no verse en Chrome; los clips sí, porque se convierten a H.264. Lo ideal: MAIN en H.264.

---

## Americanas (panel del club)

- **Quién:** el admin general (tu cuenta) o un administrador del club. En la app: *Perfil → Panel PÍCALE AI → Tokens y administradores de cada club* → escribe el correo y **Agregar** (esa persona debe haber entrado a picalereplay.com/ai una vez).
- **Tokens del club:** en el mismo lugar, **+5 / +20**. Cuesta `EVENT_TOKENS_PER_COURT_HOUR` (1) por cancha por hora. Si una cancha no manda video, ese token se devuelve al club.
- **Flujo:** *Perfil → Panel del club* → elige canchas y duración → **Iniciar americana**. Cada cancha se graba de corrido; al terminar, la IA separa cada partido (4 jugadores en la cancha; cambia cuando se vacía o cambia la gente) y saca foto con letras, stats y 3 mejores puntos por partido.
- **Jugadores:** escanean el QR de su cancha (o *Analizar → ¿Jugaste una americana?*), tocan su partido y eligen su letra. Gratis por default (`EVENT_CLAIM_COST=0`).
- **Disco:** ninguna grabación arranca si no cabe (`DISK_MB_PER_MIN=20`, `DISK_RESERVE_GB=2`). Una americana de 6 canchas × 2 h necesita ~14 GB libres mientras se procesa; después solo quedan los partidos.
- **Internet del club:** cada cancha sube ~4 Mbps mientras graba. 6 canchas ≈ 25 Mbps de subida.
