# PÍCALE App — lo que necesita el backend (api.picalereplay.com)

La app (`mobile/`) ya usa lo que existe hoy:

| Ya existe | Uso en la app |
|---|---|
| `POST /api/v1/auth/login`, `/register` | Login (una sola vez; el token se guarda en el teléfono) |
| `GET /api/v1/auth/me` | Validar sesión al abrir la app (login automático) |
| `GET /api/v1/social/users/{id}/clips` | Pestaña **Mis clips** |
| HLS `https://api.picalereplay.com/hls/{hash}/index.m3u8` | Pestaña **En vivo** y confirmación de cancha |

Todo lo de abajo es **nuevo**. Mientras no exista, la app muestra "muy pronto" y tiene modo demo (`?demo=1`).

---

## 0. CORS

La app nativa hace peticiones desde estos orígenes; agrégalos al `CORSMiddleware`:

```python
allow_origins=[
    "https://picalereplay.com", "https://www.picalereplay.com",
    "capacitor://localhost",   # iOS
    "https://localhost",       # Android
    "http://localhost",
]
```

---

## 1. Flujo del jugador

```
1. Compra tokens            → tienda → RevenueCat → webhook → +N tokens
2. "Analizar" → elige        Partido (1 token, hasta 90 min)
                             Entrenamiento (1 token por hora: 60 min = 1, 90/120 min = 2)
3. Escanea el QR de la cancha (obligatorio, no hay lista para elegir)
   → el servidor dice qué cancha es y si su cámara está transmitiendo
   → la app muestra "Somos Pádel · Cancha 3" con el video en vivo para confirmar
4. "Iniciar"                 → se descuentan los tokens y empieza a grabar
5. "Fin del juego"           → foto de la cancha con los jugadores detectados;
                               el usuario toca a cada uno y escribe su nombre / @usuario
6. "Analizar"                → se encola y se procesa en el servidor GPU
7. Push "Tu análisis está listo" → abre el reporte
```

Estados de una sesión:
`recording → naming → queued → processing → ready` (o `failed`, con devolución automática del token).

---

## 2. Verificación por QR

### Qué lleva el QR
Hoy los QR de Somos apuntan a `somos-setup.html?cancha=3`. Cualquiera puede escribir eso a mano, así que para cobrar conviene un **código secreto por cancha**:

```
https://picalereplay.com/c/7Hk2pQ9xZr
```

- `7Hk2pQ9xZr` es aleatorio (10+ caracteres), se guarda en `courts.qr_code` y no se puede adivinar.
- Si alguien escanea el QR con la cámara normal del teléfono y tiene la app, se abre directo en "Analizar" con esa cancha (deep link). Si no tiene la app, la página `/c/...` puede mandarlo a descargarla.
- Si un QR se roba o se daña, generas otro código para esa cancha y el anterior deja de servir.
- La app manda el texto completo leído; puede llegar como `https://picalereplay.com/c/<código>` (escaneado en la app) o `picale://c/<código>` (abierto desde la cámara normal vía `c.html`). El servidor toma lo que va después de `c/`.
- Los códigos de Somos ya están generados: `somos_qr_codes.sql` (para la BD) y el PDF para imprimir.

### Endpoint
`POST /api/v1/courts/resolve-qr` · cuerpo `{ "qr": "<texto completo leído>" }`

```json
{
  "court_id": "uuid", "club_name": "Somos Pádel", "court_name": "Cancha 3",
  "sport": "padel", "hls_url": "https://api.picalereplay.com/hls/c776bfbbe6618fe4/index.m3u8",
  "stream_ok": true
}
```
- **404** si el QR no es de ninguna cancha.
- `stream_ok` = el stream de esa cancha llegó al VPS en los últimos ~20 s (revisar que el `index.m3u8` se esté actualizando) **y** la mini PC del club mandó heartbeat. Si es `false`, la app no deja iniciar y no se cobra.

---

## 3. Tablas nuevas (Postgres)

Supuse que tus tablas se llaman `users`, `clubs` y `courts` con `id UUID`; ajusta los nombres cuando vea tu esquema.

```sql
ALTER TABLE courts ADD COLUMN IF NOT EXISTS qr_code TEXT UNIQUE;
ALTER TABLE clubs  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'padel';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'padel';
ALTER TABLE users  ADD COLUMN IF NOT EXISTS is_coach BOOLEAN NOT NULL DEFAULT false;

-- Tokens: el saldo es la suma del historial; user_tokens es una copia rápida
CREATE TABLE user_tokens (
  user_id    UUID PRIMARY KEY REFERENCES users(id),
  balance    INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE token_ledger (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  delta      INT NOT NULL,          -- +5 compra, -1 sesión, +1 devolución
  reason     TEXT NOT NULL,         -- purchase | session | refund_failed | refund_early | store_refund | promo | admin
  ref        TEXT,                  -- transaction_id de la tienda o session_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reason, ref)              -- una compra no se acredita dos veces
);

CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL,                  -- 'match' | 'training'
  user_id      UUID NOT NULL REFERENCES users(id),   -- quien pagó (jugador o coach)
  court_id     UUID NOT NULL REFERENCES courts(id),
  tokens_spent INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'recording',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at      TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ,
  video_path   TEXT,
  video_url    TEXT,
  snapshot_url TEXT,
  snapshot_json JSONB,                          -- personas detectadas en la foto final
  progress     REAL,
  result_json  JSONB,
  error        TEXT
);
CREATE UNIQUE INDEX one_recording_per_court ON sessions(court_id) WHERE status = 'recording';
CREATE UNIQUE INDEX one_recording_per_user  ON sessions(user_id)  WHERE status = 'recording';

CREATE TABLE session_players (
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  track_id      TEXT NOT NULL,          -- 'A'..'D' (o más en entrenamiento)
  seed_box      JSONB,                  -- [x,y,w,h] normalizado en la foto final
  user_id       UUID REFERENCES users(id),
  display_name  TEXT,
  tag_status    TEXT,                   -- NULL | pending | accepted | declined
  stats         JSONB,
  clips_by_shot JSONB,                  -- entrenamiento: { "Bandeja": [{url,t}], ... }
  heatmap_url   TEXT,
  coach_summary TEXT,                   -- texto de la IA
  coach_note    TEXT,                   -- nota escrita por el coach
  PRIMARY KEY (session_id, track_id)
);

CREATE TABLE devices (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  platform   TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Endpoints

Todos con `Authorization: Bearer <token>`.

### Tokens
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/v1/credits/me` | `{ "credits": 3 }` (saldo de tokens) |
| POST | `/api/v1/purchases/revenuecat-webhook` | lo llama RevenueCat |

Productos (consumibles): `picale_token_1` (+1), `picale_token_5` (+5), `picale_token_10` (+10, paquete coach).
En el webhook: evento de compra → `+N` con `ref = transaction_id`; evento `REFUND` → `-N`. Si el saldo queda negativo, no puede iniciar sesiones hasta reponer.

### Sesiones
| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/v1/courts/resolve-qr` | ver sección 2 |
| POST | `/api/v1/sessions` | `{ type, court_id, duration_min }` → crea y empieza a grabar |
| GET | `/api/v1/sessions/active` | sesión del usuario en `recording` o `naming`, o `{}` |
| POST | `/api/v1/sessions/{id}/finish` | "Fin del juego": corta la grabación, toma la foto final → `{ status: "naming" }` |
| GET | `/api/v1/sessions/{id}/snapshot` | foto final + personas detectadas |
| PUT | `/api/v1/sessions/{id}/players` | nombres → `status = queued` |
| GET | `/api/v1/sessions/me` | `{ "sessions": [...] }` |
| GET | `/api/v1/sessions/{id}` | reporte |
| POST | `/api/v1/sessions/{id}/players/{track_id}/report` | entrenamiento: guarda nota del coach y envía al alumno |
| POST | `/api/v1/devices` | `{ token, platform }` para push |

**POST /sessions** — validaciones en una sola transacción:
1. `duration_min`: partido = 90; entrenamiento ∈ {60, 90, 120}. Tokens = 1 en partido; `ceil(min/60)` en entrenamiento. **El servidor calcula el costo**, no confía en la app.
2. Saldo suficiente → si no, **402**.
3. Cancha libre → si no, **409** ("ya hay una sesión grabándose en esta cancha").
4. Stream vivo → si no, **412**.
5. Descuenta tokens (`token_ledger` −N), crea la sesión y manda `rec/start` a la mini PC del club.

**GET /snapshot**:
```json
{
  "image_url": "https://.../snap.jpg",
  "people": [
    { "track_id": "A", "box": [0.25, 0.58, 0.08, 0.27], "hint": "Cerca · izquierda" },
    { "track_id": "B", "box": [0.63, 0.56, 0.08, 0.27], "hint": "Cerca · derecha" }
  ]
}
```
`box` = x, y, ancho, alto en proporción de la imagen (0–1). Si la detección falla, regresa `people: []` y la app muestra 4 lugares fijos (cerca/fondo, izquierda/derecha).

**PUT /players**:
```json
{ "players": [
  { "track_id": "B", "me": true },
  { "track_id": "A", "username": "juan" },
  { "track_id": "C", "display_name": "Beto" }
] }
```
- `me` → el usuario que pagó.
- `username` → `tag_status = pending` + push "Pablo te etiquetó"; ve sus stats al aceptar, sin gastar token.
- `display_name` → solo nombre.
- Si en 2 horas nadie pone nombres, se encola igual como Jugador A–D.

**Objeto sesión** (lo que pinta la app):
```json
{
  "id": "uuid", "type": "match", "status": "ready", "court_id": "uuid",
  "started_at": 1762300000, "video_url": "https://...", "is_owner": true,
  "players": [{
    "track_id": "B", "is_me": true, "display_name": "Pablo",
    "heatmap_url": "https://...", "coach_summary": "texto de la IA",
    "coach_note": null,
    "clips_by_shot": { "Bandeja": [{ "url": "https://...", "t": 312.4 }] },
    "stats": {
      "distance_m": 1980, "total_shots": 240, "net_pct": 41, "max_speed_kmh": 19.8,
      "shots_per_min": 4.1, "avg_rally": 6.3, "active_min": 51,
      "shots": { "Drive": 52, "Revés": 71, "Volea": 44 }
    }
  }]
}
```
Partido usa `distance_m, net_pct, max_speed_kmh`. Entrenamiento usa `shots_per_min, avg_rally, active_min` y `clips_by_shot`.

### Push que manda el servidor
- Análisis listo → `data: { "session_id": "<id>" }` (al que pagó y a etiquetados que aceptaron)
- Etiquetado → `data: { "session_id": "<id>" }` con texto "Pablo te etiquetó en su partido"
- Clip nuevo → `data: { "clip_id": "<id>" }`

---

## 5. Entrenamientos (coaches)

Objetivo: que el coach lo use en cada clase y se consuman más tokens.

- **Quién paga:** el coach compra tokens (paquete de 10) y los usa por hora de clase. Más adelante se puede agregar que el alumno pague su propio reporte.
- **Qué recibe el coach:** por alumno, golpes por tipo, golpes por minuto, rally promedio, tiempo activo, **clips cortados por tipo de golpe** (todas las bandejas, todas las salidas de pared…), resumen de la IA y un campo para su nota.
- **Qué recibe el alumno:** su reporte con la nota del coach (push si tiene cuenta, link para compartir si no).
- **Siguiente paso natural:** historial por alumno ("esta semana vs. la pasada") para que el coach lo use como argumento de venta de sus clases.
- `users.is_coach` sirve para mostrarle el paquete coach y, si quieres, limitar entrenamientos a coaches verificados por el club.

---

## 6. Grabación en la mini PC del club

La sesión se graba en la mini PC con el canal **MAIN (101)**, no en el VPS: mejor calidad para la pelota, y si se cae el internet sigue grabando y sube después. Grabar con `-c copy` solo copia a disco, la PC casi no se carga. La IA sigue en el servidor GPU.

Referencia: un partido de 90 min en MAIN pesa ~1.7 GB (~2.5 Mbps).

### Mensajes MQTT (Mosquitto del VPS)
```
picale/<club>/rec/start   {"session_id","court_id","camera_ip","duration_s","upload_url","token"}
picale/<club>/rec/stop    {"session_id"}
picale/<club>/rec/status  ← la mini PC publica: {"session_id","state":"recording|uploading|done|error","segments_done","segments_total"}
picale/<club>/heartbeat   ← la mini PC cada 15 s (el API lo usa para saber si el club está en línea)
```
`token` = token de un solo uso para esa sesión; la mini PC lo manda al subir los pedazos.

### En la mini PC (nuevo módulo de `picale_somos.py` o servicio aparte)
```
start  → ffmpeg -rtsp_transport tcp -i rtsp://<cámara>/Streaming/Channels/101 \
           -t <duration_s> -c copy -f segment -segment_time 300 -reset_timestamps 1 \
           C:\picale\sesiones\<session_id>\seg_%03d.mp4
         (pedazos de 5 min)
cada pedazo cerrado → a la cola de subida (la misma idea que cola_subida.json)
stop   → detiene ffmpeg, cierra el último pedazo, avisa "uploading"
subido → borra el pedazo local
```

### Endpoints de subida
| Método | Ruta | Qué hace |
|---|---|---|
| PUT | `/api/v1/sessions/{id}/segments/{n}` | sube un pedazo (cuerpo = el mp4, header `X-Session-Token`) |
| POST | `/api/v1/sessions/{id}/segments/complete` | `{ "total": 18 }` → el servidor ya tiene todo |

### Qué hace el servidor
```
POST /sessions
  └─ valida tokens, cancha libre y que la mini PC del club esté en línea (heartbeat)
  └─ publica rec/start por MQTT → status = recording

POST /finish (o se acaba el tiempo)
  └─ publica rec/stop → status = naming
  └─ foto final: del último pedazo ya subido
       ffmpeg -sseof -5 -i seg_N.mp4 -frames:v 1 snap.jpg
       + detección rápida de personas (YOLO nano en CPU)

PUT /players            → nombres guardados
segments/complete        → une los pedazos sin recodificar:
       ffmpeg -f concat -safe 0 -i lista.txt -c copy <id>.mp4
  └─ cuando hay nombres Y video completo → status = queued → GPU

Worker GPU (Modal)
  └─ status = processing (+progress)
  └─ tracking + re-identificación por apariencia, arrancando desde los nombres de la foto final
  └─ homografía, golpes, distancias, heatmaps; entrenamiento: clips por tipo de golpe
  └─ API de Claude: coach_summary por jugador
  └─ status = ready → push

Errores
  └─ la mini PC no responde al start → no se cobra, la app dice "el club está sin conexión"
  └─ faltan pedazos 2 h después del final, o falla el worker → failed + devolución de tokens
  └─ "Fin del juego" en los primeros 10 min → devolución de tokens
```

La foto final necesita que el último pedazo ya esté subido; con el internet dedicado eso es menos de un minuto. Mientras, la app muestra "sacando una foto de la cancha…".

Al arrancar, la mini PC revisa si quedó una sesión a medias (se fue la luz) y sube lo que tenga.

### Internet
Con las 8 canchas grabando a la vez son ~20 Mbps de subida, más los 8 streams del SUB. Si la subida no alcanza, los pedazos solo se atrasan; no se pierde nada.

---

## 7. Versión web para el piloto (picalereplay.com/ai)

La misma app (`mobile/www`) se sirve en `https://picalereplay.com/ai/` mientras salen las versiones de tienda. Usa la misma sesión que la web (`picale_token` en localStorage), así que quien ya entró en picalereplay.com no vuelve a iniciar sesión.

Diferencias con la app nativa:

| | Web (`/ai`) | App nativa |
|---|---|---|
| Escanear QR | Cámara del navegador (jsQR / BarcodeDetector), o la cámara normal del teléfono → `/c/<código>` → `/ai/?qr=<código>` | Escáner nativo |
| Compra de tokens | Mercado Pago (sin comisión de tiendas) | Compras de App Store / Google Play |
| Aviso de análisis listo | Se ve en la pestaña Análisis (opcional: correo) | Push |

Endpoints solo para la web:

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/v1/purchases/products` | `{ "products": [{ "id":"picale_token_1", "label":"1 token", "price_mxn":99 }, …] }` |
| POST | `/api/v1/purchases/checkout` | `{ product_id, return_url }` → crea la preferencia de Mercado Pago y regresa `{ "url": "<init_point>" }`; `back_urls.success = return_url` |
| POST | `/api/v1/purchases/mercadopago-webhook` | Mercado Pago avisa el pago aprobado → `+N` tokens en `token_ledger` con `ref = payment_id` |

Mientras `/checkout` no exista, la página de tokens muestra: "Durante el piloto los tokens los da PÍCALE". Para el piloto basta con dar tokens a mano (`token_ledger` con `reason = 'promo'`).

**Regla de las tiendas:** el pago con Mercado Pago solo aparece en la web. La app nativa no lo muestra ni lo menciona (el código ya lo separa con `isNative`).

---

## 8. Seguridad

`picaleai.html` tiene escrita la `API_KEY` de `/api/v1/edge/ai-status`. Como el repo es público, cualquiera la puede leer: conviene cambiarla en el servidor y no ponerla en el HTML.
