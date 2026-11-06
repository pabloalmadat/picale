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
            out.append(((x1 + x2) / 2, y2, float(c), (x1, y1, x2, y2)))   # pies = centro de la base de la caja
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


def _open(video_path):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("No se pudo abrir el video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fw, fh = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    return cap, fps, total, fw, fh


def _calibrate(video_path, calibration, fw, fh):
    """Sin calibración manual → la cancha se calibra sola con el mismo video."""
    auto, review, calinfo = None, None, {}
    if not (calibration and calibration.get("corners")) or calibration.get("method") == "auto":
        try:
            auto, review, calinfo = auto_calibrate(video_path)
        except Exception as e:                       # nunca tumba el análisis
            calinfo = {"method": "auto", "error": f"{type(e).__name__}: {e}"}
        if auto:
            calibration = auto
    H, calibrated = homography(calibration, fw, fh)
    cal_meta = dict(calinfo, used=(calibration or {}).get("method", "manual") if calibrated else "aproximada")
    return H, calibrated, auto, review, cal_meta


def _appearance(frame, box):
    """Color de la ropa (parte de arriba del cuerpo) → sirve para saber si cambiaron los jugadores."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y1 + int((y2 - y1) * 0.6))
    if x2 - x1 < 3 or y2 - y1 < 3:
        return None
    hsv = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [12, 4], [0, 180, 0, 256])
    cv2.normalize(hist, hist, 1, 0, cv2.NORM_L1)
    return hist.astype(np.float32)


def detect_all(cap, fps, total, H, detector, progress=None, sample_fps=SAMPLE_FPS, appearance=False, p0=0.0, p1=0.98):
    """Recorre el video una vez: [(t, [pos en metros], [caja px], [color])] solo de gente dentro de la cancha."""
    step = max(1, round(fps / sample_fps))
    frames, idx, last_report = [], 0, -1
    while True:
        if not cap.grab():
            break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            feet = detector(frame)
            pts = to_court(H, [(f[0], f[1]) for f in feet])
            keep = [i for i, p in enumerate(pts) if -0.5 <= p[0] <= COURT_W + 0.5 and -1.0 <= p[1] <= COURT_L + 1.0]
            boxes = [tuple(float(v) for v in feet[i][3]) if len(feet[i]) > 3 else None for i in keep]
            hists = [(_appearance(frame, b) if (appearance and b) else None) for b in boxes]
            frames.append((idx / fps, [tuple(pts[i]) for i in keep], boxes, hists))
            if progress and total:
                pct = int(100 * idx / total)
                if pct >= last_report + 2:
                    last_report = pct
                    progress(p0 + (p1 - p0) * min(1.0, idx / total))
        idx += 1
    return frames, idx


def track_window(frames, sample_fps=SAMPLE_FPS, t0=0.0):
    """Sigue a los 4 jugadores en un tramo. Tiempos de salida relativos a t0.
    → players {A–D: {stats, heatmap}}, moments, {letra: slot}, asignación por cuadro."""
    seeds = list(QUAD_CENTERS.values())
    slots = [{"pos": None, "vel": (0.0, 0.0), "miss": 0, "seed": seeds[i], "track": []} for i in range(4)]
    last_t, assigns = None, []
    for t, dets, _, _ in frames:
        t = t - t0
        dt = (t - last_t) if last_t is not None else 1 / sample_fps
        m = assign(slots, dets, dt)
        assigns.append(m)
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

    # Letra final = cuadrante donde terminó cada jugador (últimos ~10 s)
    finals = []
    for s in slots:
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
    players, letter_slot = {}, {}
    for si, q in labels.items():
        tr = slots[si]["track"]
        if len(tr) < sample_fps * 30:       # menos de 30 s visto: no es un jugador
            continue
        players[q] = {"stats": stats(tr, sample_fps), "heatmap_png_b64": heatmap_png(tr)}
        letter_slot[q] = si
    return players, moms, letter_slot, assigns


def analyze(video_path, calibration=None, detector=None, progress=None, sample_fps=SAMPLE_FPS):
    cap, fps, total, fw, fh = _open(video_path)
    H, calibrated, auto, review, cal_meta = _calibrate(video_path, calibration, fw, fh)
    detector = detector or YoloDetector()
    frames, idx = detect_all(cap, fps, total, H, detector, progress, sample_fps)
    cap.release()
    players, moms, _, _ = track_window(frames, sample_fps)
    return {"players": players, "moments": moms,
            "auto_calibration": auto, "calibration_review_jpg_b64": review,
            "meta": {"calibrated": calibrated, "calibration": cal_meta, "fps": fps, "frames": idx,
                     "minutes": round(idx / fps / 60, 1), "version": "v1-movimiento"}}


# ───────────── americanas: grabación larga con varios partidos

EV_MIN_MATCH_S = 240.0     # un partido dura al menos 4 min
EV_HOLE_S = 8.0            # huecos más cortos (alguien tapado, sale por una pelota) no cortan el partido
EV_MERGE_GAP_S = 90.0      # pausa corta con los mismos 4 jugadores = sigue el mismo partido
EV_SAME_THR = 0.35         # distancia de color de ropa por debajo de esto = mismos jugadores
EV_SIG_EVERY_S = 20.0


def _signature(frames, i0, i1, step=1):
    """Hasta 5 cuadros con exactamente 4 personas → listas de colores."""
    out = []
    for i in range(i0, i1, step):
        _, dets, _, hists = frames[i]
        if len(dets) == 4 and all(h is not None for h in hists):
            out.append(hists)
            if len(out) >= 5:
                break
    return out


def _sig_dist(a, b):
    """Distancia entre dos grupos de 4 (mejor emparejamiento, mediana de varios cuadros)."""
    import itertools
    if not a or not b:
        return None
    ds = []
    for ha, hb in zip(a, b):
        best = min(sum(cv2.compareHist(ha[i], hb[p[i]], cv2.HISTCMP_BHATTACHARYYA) for i in range(4)) / 4
                   for p in itertools.permutations(range(4)))
        ds.append(best)
    return float(np.median(ds))


def split_matches(frames, sample_fps=SAMPLE_FPS, min_match_s=None, hole_s=None,
                  merge_gap_s=None, same_thr=None, sig_every_s=None):
    """Corta una grabación larga en partidos: tramos con 4 jugadores en la cancha; se separan
    cuando la cancha se vacía o cuando cambia la gente (color de ropa)."""
    min_match_s = EV_MIN_MATCH_S if min_match_s is None else min_match_s
    hole_s = EV_HOLE_S if hole_s is None else hole_s
    merge_gap_s = EV_MERGE_GAP_S if merge_gap_s is None else merge_gap_s
    same_thr = EV_SAME_THR if same_thr is None else same_thr
    sig_every_s = EV_SIG_EVERY_S if sig_every_s is None else sig_every_s
    n = len(frames)
    if not n:
        return []
    counts = np.array([len(f[1]) for f in frames], dtype=float)
    w = max(1, int(5 * sample_fps)) | 1
    pad = np.pad(counts, w // 2, mode="edge")
    med = np.array([np.median(pad[i:i + w]) for i in range(n)])
    on = np.abs(med - 4) < 0.6
    # rellena huecos cortos
    hole = int(hole_s * sample_fps)
    i = 0
    while i < n:
        if not on[i]:
            j = i
            while j < n and not on[j]:
                j += 1
            if 0 < i and j < n and j - i <= hole:
                on[i:j] = True
            i = j
        else:
            i += 1
    runs, i = [], 0
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            runs.append([i, j])
            i = j
        else:
            i += 1

    # dentro de un tramo: ¿cambió la gente sin que se vaciara la cancha?
    sig_n = max(1, int(sig_every_s * sample_fps))
    split_runs = []
    for a, b in runs:
        cuts, prev = [a], None
        for k in range(a, b, sig_n):
            s = _signature(frames, k, min(b, k + sig_n))
            if prev is not None and s:
                d = _sig_dist(prev, s)
                if d is not None and d > same_thr:
                    nxt = _signature(frames, min(b, k + sig_n), min(b, k + 2 * sig_n))
                    d2 = _sig_dist(prev, nxt) if nxt else d
                    if d2 is None or d2 > same_thr:     # el cambio se sostiene → otro partido
                        cuts.append(k)
                        prev = s
                        continue
            if s:
                prev = s
        cuts.append(b)
        split_runs += [[cuts[x], cuts[x + 1]] for x in range(len(cuts) - 1)]

    # une tramos separados por pausas cortas si son los mismos jugadores
    merged = []
    for r in split_runs:
        if merged:
            pa, pb = merged[-1]
            gap = (frames[r[0]][0] - frames[pb - 1][0])
            if gap <= merge_gap_s:
                d = _sig_dist(_signature(frames, max(pa, pb - int(30 * sample_fps)), pb),
                              _signature(frames, r[0], min(r[1], r[0] + int(30 * sample_fps))))
                if d is not None and d <= same_thr:
                    merged[-1][1] = r[1]
                    continue
        merged.append(list(r))
    out = []
    for a, b in merged:
        t0, t1 = frames[a][0], frames[b - 1][0]
        if t1 - t0 >= min_match_s:
            out.append((a, b, t0, t1))
    return out


def _snapshot(video_path, frames, a, b, letter_slot, assigns, sample_fps=SAMPLE_FPS):
    """Foto del partido con la letra de cada jugador encima (para que se reconozcan)."""
    def clean(k):
        m, boxes = assigns[k - a], frames[k][2]
        if len(frames[k][1]) != 4 or not all(si in m for si in letter_slot.values()) or not boxes or boxes[0] is None:
            return False
        bs = [boxes[m[si]] for si in letter_slot.values()]
        for i in range(len(bs)):            # nadie encimado
            for j in range(i + 1, len(bs)):
                ix = min(bs[i][2], bs[j][2]) - max(bs[i][0], bs[j][0])
                iy = min(bs[i][3], bs[j][3]) - max(bs[i][1], bs[j][1])
                if ix > 0 and iy > 0:
                    return False
        return True
    # de atrás para adelante (las letras son de cómo terminaron), sin los últimos segundos de cambio
    start = max(a, b - 1 - int(5 * sample_fps))
    best = next((k for k in range(start, a - 1, -1) if clean(k)), None)
    if best is None:
        best = next((k for k in range(b - 1, a - 1, -1) if len(frames[k][1]) == 4), b - 1)
    cap = cv2.VideoCapture(str(video_path))
    cap.set(cv2.CAP_PROP_POS_MSEC, frames[best][0] * 1000)
    ok, img = cap.read()
    cap.release()
    if not ok:
        return None
    h, w = img.shape[:2]
    m = assigns[best - a]
    for letter, si in letter_slot.items():
        if si not in m or not frames[best][2]:
            continue
        box = frames[best][2][m[si]]
        if not box:
            continue
        x1, y1, x2, y2 = [int(v) for v in box]
        cv2.rectangle(img, (x1, y1), (x2, y2), (94, 232, 122), max(2, w // 500))
        r = max(14, w // 70)
        cx, cy = (x1 + x2) // 2, max(r + 2, y1 - r - 4)
        cv2.circle(img, (cx, cy), r, (94, 232, 122), -1)
        cv2.putText(img, letter, (cx - int(r * 0.45), cy + int(r * 0.45)), cv2.FONT_HERSHEY_SIMPLEX,
                    r / 22, (10, 10, 10), max(2, r // 7))
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf.tobytes()).decode() if ok else None


def analyze_event(video_path, calibration=None, detector=None, progress=None, sample_fps=SAMPLE_FPS, **split_kw):
    """Americana: encuentra cada partido en la grabación y analiza cada uno por separado."""
    cap, fps, total, fw, fh = _open(video_path)
    H, calibrated, auto, review, cal_meta = _calibrate(video_path, calibration, fw, fh)
    detector = detector or YoloDetector()
    frames, idx = detect_all(cap, fps, total, H, detector, progress, sample_fps, appearance=True, p1=0.9)
    cap.release()
    matches = []
    for a, b, t0, t1 in split_matches(frames, sample_fps, **split_kw):
        players, moms, letter_slot, assigns = track_window(frames[a:b], sample_fps, t0=t0)
        if len(players) < 2:
            continue
        snap = _snapshot(video_path, frames, a, b, letter_slot, assigns, sample_fps)
        matches.append({"start": round(t0, 1), "end": round(t1, 1), "players": players, "moments": moms,
                        "snapshot_jpg_b64": snap})
    return {"matches": matches,
            "auto_calibration": auto, "calibration_review_jpg_b64": review,
            "meta": {"calibrated": calibrated, "calibration": cal_meta, "fps": fps, "frames": idx,
                     "minutes": round(idx / fps / 60, 1), "version": "v1-americana", "matches": len(matches)}}


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
