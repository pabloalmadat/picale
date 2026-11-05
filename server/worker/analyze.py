"""PÍCALE AI · análisis v1 de un partido completo.

Mide, para cada uno de los 4 jugadores: distancia recorrida, tiempo cerca de la red,
velocidad máxima, minutos en movimiento y mapa de calor.
(Clasificación de golpes: siguiente versión, a partir de picale_ai_pro.py.)

Cómo sabe quién es quién:
- Detecta personas con YOLO ~5 veces por segundo y las pasa a metros de la cancha
  (homografía con las 4 esquinas calibradas).
- Sigue a cada jugador por continuidad de posición cuadro a cuadro, también cuando
  cambian de lado.
- Al final, cada jugador recibe la letra del cuadrante donde terminó (A–D), que es
  donde el usuario lo nombró en la foto final.
"""
import base64
import io
import math

import cv2
import numpy as np
from PIL import Image, ImageDraw

from autocal import auto_calibrate

COURT_W, COURT_L = 10.0, 20.0                  # metros
QUAD_CENTERS = {"A": (2.5, 5.0), "B": (7.5, 5.0), "C": (2.5, 15.0), "D": (7.5, 15.0)}
SAMPLE_FPS = 5.0
NET_ZONE_M = 4.0                               # "cerca de la red" = a menos de 4 m
MAX_SPEED_MS = 8.0                             # más rápido que esto es un error de detección
MOVING_MS = 1.0


# ───────────── homografía

def homography(calib, frame_w, frame_h):
    """Esquinas en orden: cerca-izquierda, cerca-derecha, fondo-derecha, fondo-izquierda (px de la imagen)."""
    if calib and calib.get("corners") and len(calib["corners"]) == 4:
        sx = frame_w / float(calib.get("width") or frame_w)
        sy = frame_h / float(calib.get("height") or frame_h)
        src = np.float32([[x * sx, y * sy] for x, y in calib["corners"]])
        calibrated = True
    else:  # cámara típica detrás de la cancha: aproximación
        w, h = frame_w, frame_h
        src = np.float32([[0.04 * w, 0.97 * h], [0.96 * w, 0.97 * h], [0.67 * w, 0.30 * h], [0.33 * w, 0.30 * h]])
        calibrated = False
    dst = np.float32([[0, 0], [COURT_W, 0], [COURT_W, COURT_L], [0, COURT_L]])
    return cv2.getPerspectiveTransform(src, dst), calibrated


def to_court(H, pts):
    if not len(pts):
        return np.zeros((0, 2))
    p = cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H)
    return p.reshape(-1, 2)


# ───────────── detección

class YoloDetector:
    def __init__(self, weights="yolo11n.pt", imgsz=960, device=None):
        from ultralytics import YOLO
        self.model = YOLO(weights)
        self.imgsz = imgsz
        self.device = device

    def __call__(self, frame):
        r = self.model.predict(frame, classes=[0], conf=0.3, imgsz=self.imgsz, verbose=False, device=self.device)[0]
        out = []
        for (x1, y1, x2, y2), c in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.conf.cpu().numpy()):
            out.append(((x1 + x2) / 2, y2, float(c)))      # los pies: centro de la base de la caja
        return out


# ───────────── seguimiento de 4 jugadores

def predict(s, dt):
    """Dónde debería estar el jugador ahora, según su velocidad (resuelve cruces entre jugadores)."""
    k = dt * (s["miss"] + 1)
    return (s["pos"][0] + s["vel"][0] * k, s["pos"][1] + s["vel"][1] * k)


def assign(slots, dets, dt):
    """Empareja detecciones con jugadores por cercanía a su posición predicha (greedy)."""
    pairs = []
    for si, s in enumerate(slots):
        if s["pos"] is None:
            continue
        guess = predict(s, dt)
        for di, d in enumerate(dets):
            dist = math.dist(guess, d)
            gate = MAX_SPEED_MS * max(dt, 0.2) + 1.5 + min(s["miss"], 25) * 0.4
            if dist <= gate:
                pairs.append((dist, si, di))
    pairs.sort()
    used_s, used_d, out = set(), set(), {}
    for dist, si, di in pairs:
        if si in used_s or di in used_d:
            continue
        used_s.add(si)
        used_d.add(di)
        out[si] = di
    # jugadores aún sin posición: toman detecciones libres, la más cercana a su cuadrante inicial
    free = [di for di in range(len(dets)) if di not in used_d]
    for si, s in enumerate(slots):
        if s["pos"] is None and free:
            di = min(free, key=lambda k: math.dist(dets[k], s["seed"]))
            out[si] = di
            free.remove(di)
    return out


def analyze(video_path, calibration=None, detector=None, progress=None, sample_fps=SAMPLE_FPS):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("No se pudo abrir el video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fw, fh = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # Sin calibración manual → la cancha se calibra sola con el mismo video
    auto, review, calinfo = None, None, {}
    if not (calibration and calibration.get("corners")) or calibration.get("method") == "auto":
        try:
            auto, review, calinfo = auto_calibrate(video_path)
        except Exception as e:                       # nunca tumba el análisis
            calinfo = {"method": "auto", "error": f"{type(e).__name__}: {e}"}
        if auto:
            calibration = auto
    H, calibrated = homography(calibration, fw, fh)
    detector = detector or YoloDetector()
    step = max(1, round(fps / sample_fps))

    seeds = list(QUAD_CENTERS.values())
    slots = [{"pos": None, "vel": (0.0, 0.0), "miss": 0, "seed": seeds[i], "track": []} for i in range(4)]
    idx, last_t, last_report = 0, None, -1
    while True:
        ok = cap.grab()
        if not ok:
            break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            t = idx / fps
            feet = detector(frame)
            pts = to_court(H, [(x, y) for x, y, _ in feet])
            dets = [tuple(p) for p in pts if -0.5 <= p[0] <= COURT_W + 0.5 and -1.0 <= p[1] <= COURT_L + 1.0]
            dt = (t - last_t) if last_t is not None else 1 / sample_fps
            m = assign(slots, dets, dt)
            for si, s in enumerate(slots):
                if si in m:
                    new = dets[m[si]]
                    if s["pos"] is not None:
                        gap = dt * (s["miss"] + 1)
                        vx, vy = (new[0] - s["pos"][0]) / gap, (new[1] - s["pos"][1]) / gap
                        sp = math.hypot(vx, vy)
                        if sp > MAX_SPEED_MS:
                            vx, vy = vx * MAX_SPEED_MS / sp, vy * MAX_SPEED_MS / sp
                        s["vel"] = (0.5 * s["vel"][0] + 0.5 * vx, 0.5 * s["vel"][1] + 0.5 * vy)
                    s["pos"] = new
                    s["miss"] = 0
                    s["track"].append((t, s["pos"][0], s["pos"][1]))
                else:
                    s["miss"] += 1
                    if s["miss"] > 10:          # 2 s sin verlo: deja de extrapolar
                        s["vel"] = (0.0, 0.0)
            last_t = t
            if progress and total:
                pct = int(100 * idx / total)
                if pct >= last_report + 2:
                    last_report = pct
                    progress(min(0.98, idx / total))
        idx += 1
    cap.release()

    # Letra final = cuadrante donde terminó cada jugador (últimos ~10 s)
    finals = []
    for si, s in enumerate(slots):
        tail = [p[1:] for p in s["track"][-int(10 * sample_fps):]]
        finals.append(tuple(np.median(np.array(tail), axis=0)) if tail else None)
    labels, taken = {}, set()
    order = sorted(((math.dist(finals[si], c), si, q) for si in range(4) if finals[si] for q, c in QUAD_CENTERS.items()))
    for _, si, q in order:
        if si in labels or q in taken:
            continue
        labels[si] = q
        taken.add(q)

    moms = moments([s["track"] for s in slots], sample_fps)

    players = {}
    for si, q in labels.items():
        tr = slots[si]["track"]
        if len(tr) < sample_fps * 30:       # menos de 30 s visto: no es un jugador
            continue
        players[q] = {"stats": stats(tr, sample_fps), "heatmap_png_b64": heatmap_png(tr)}
    cal_meta = dict(calinfo, used=(calibration or {}).get("method", "manual") if calibrated else "aproximada")
    return {"players": players, "moments": moms,
            "auto_calibration": auto, "calibration_review_jpg_b64": review,
            "meta": {"calibrated": calibrated, "calibration": cal_meta, "fps": fps, "frames": idx, "minutes": round(idx / fps / 60, 1),
                     "version": "v1-movimiento"}}


# ───────────── puntos del partido (para clips automáticos)

RALLY_ON = 1.1      # m/s promedio de los jugadores para considerar que se está jugando
RALLY_OFF = 0.6     # por debajo de esto, el punto terminó
RALLY_GAP_S = 2.5   # tiempo tranquilo que cierra un punto
RALLY_MIN_S = 4.0   # puntos más cortos se ignoran
PAD_BEFORE, PAD_AFTER = 1.5, 2.0


def moments(tracks, sample_fps):
    """Corta el partido en puntos usando la actividad de los 4 jugadores.

    Durante un punto los jugadores se mueven sin parar; entre puntos caminan o se quedan
    quietos. Regresa [{start, end, intensity, peak_kmh}] en segundos del video.
    """
    if not any(tracks):
        return []
    dt = 1.0 / sample_fps
    end_t = max(tr[-1][0] for tr in tracks if tr)
    n = int(end_t / dt) + 2
    speed_sum, count = np.zeros(n), np.zeros(n)
    for tr in tracks:
        if len(tr) < 3:
            continue
        a = np.array(tr, dtype=float)
        xy = smooth(a[:, 1:], 5)
        for i in range(1, len(a)):
            gap = a[i, 0] - a[i - 1, 0]
            if gap <= 0 or gap > 1.0:
                continue
            v = float(np.linalg.norm(xy[i] - xy[i - 1])) / gap
            if v > MAX_SPEED_MS:
                continue
            k = int(a[i, 0] / dt)
            speed_sum[k] += v
            count[k] += 1
    act = np.divide(speed_sum, count, out=np.zeros(n), where=count > 0)
    w = max(1, int(sample_fps))                                     # promedio móvil de 1 s
    act = np.convolve(act, np.ones(w) / w, mode="same")

    out, start, quiet = [], None, 0
    for k in range(n):
        t = k * dt
        if start is None:
            if act[k] >= RALLY_ON:
                start, quiet = t, 0
        else:
            quiet = quiet + 1 if act[k] < RALLY_OFF else 0
            if quiet * dt >= RALLY_GAP_S or k == n - 1:
                stop = t - quiet * dt
                if stop - start >= RALLY_MIN_S:
                    seg = act[int(start / dt):int(stop / dt) + 1]
                    out.append({"start": round(max(0.0, start - PAD_BEFORE), 1),
                                "end": round(min(end_t, stop + PAD_AFTER), 1),
                                "intensity": round(float(seg.mean()) * (stop - start), 1),
                                "peak_kmh": round(float(seg.max()) * 3.6, 1)})
                start = None
    # los 5 más intensos se marcan como "mejores puntos"
    for m in sorted(out, key=lambda m: -m["intensity"])[:5]:
        m["top"] = True
    return out


# ───────────── estadísticas

def smooth(arr, k=3):
    if len(arr) < k:
        return arr
    out = arr.copy()
    for i in range(len(arr)):
        a, b = max(0, i - k // 2), min(len(arr), i + k // 2 + 1)
        out[i] = np.median(arr[a:b], axis=0)
    return out


def stats(track, sample_fps):
    a = np.array(track, dtype=float)
    t, xy = a[:, 0], smooth(a[:, 1:], 5)
    dist, moving, speeds = 0.0, 0.0, []
    for i in range(1, len(a)):
        dt = t[i] - t[i - 1]
        if dt <= 0 or dt > 2:
            continue
        d = float(np.linalg.norm(xy[i] - xy[i - 1]))
        v = d / dt
        if v > MAX_SPEED_MS:
            continue
        if d > 0.05:
            dist += d
        if v > MOVING_MS:
            moving += dt
    # velocidad sostenida en ventanas de 1 s
    w = max(1, int(sample_fps))
    for i in range(w, len(a)):
        dt = t[i] - t[i - w]
        if 0 < dt <= 2:
            v = float(np.linalg.norm(xy[i] - xy[i - w])) / dt
            if v <= MAX_SPEED_MS:
                speeds.append(v)
    near_net = float(np.mean(np.abs(xy[:, 1] - COURT_L / 2) < NET_ZONE_M)) * 100
    return {
        "distance_m": round(dist),
        "net_pct": round(near_net, 1),
        "max_speed_kmh": round(float(max(speeds)) * 3.6, 1) if speeds else None,
        "active_min": round(float(moving) / 60, 1),
        "minutes": round(float(t[-1] - t[0]) / 60, 1),
    }


def heatmap_png(track, scale=20):
    """Vista de arriba de la cancha (10×20 m), fondo arriba, cámara abajo."""
    W, L = int(COURT_W * scale), int(COURT_L * scale)
    grid = np.zeros((L, W), dtype=float)
    for _, x, y in track:
        if 0 <= x < COURT_W and 0 <= y < COURT_L:
            grid[L - 1 - int(y * scale), int(x * scale)] += 1
    g = cv2.GaussianBlur(grid.astype(np.float32), (0, 0), scale * 0.9)
    if g.max() > 0:
        g = g / g.max()
    pad = 16
    img = Image.new("RGBA", (W + 2 * pad, L + 2 * pad), (18, 22, 30, 255))
    court = Image.new("RGBA", (W, L), (31, 58, 92, 255))
    heat = np.zeros((L, W, 4), dtype=np.uint8)
    heat[..., 0], heat[..., 1], heat[..., 2] = 94, 232, 122
    heat[..., 3] = np.uint8(np.clip(g ** 0.7, 0, 1) * 220)
    court.alpha_composite(Image.fromarray(heat, "RGBA"))
    img.alpha_composite(court, (pad, pad))
    d = ImageDraw.Draw(img)
    line = (235, 235, 235, 255)
    d.rectangle([pad, pad, pad + W - 1, pad + L - 1], outline=line, width=2)
    net_y = pad + L // 2
    d.line([pad, net_y, pad + W, net_y], fill=line, width=4)
    svc = int(6.95 * scale)
    for yy in (net_y - svc, net_y + svc):
        d.line([pad, yy, pad + W, yy], fill=line, width=2)
    d.line([pad + W // 2, net_y - svc, pad + W // 2, net_y + svc], fill=line, width=2)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()
