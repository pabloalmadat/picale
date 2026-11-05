"""PÍCALE AI · calibración automática de la cancha.

Encuentra las 4 esquinas del pasto de la cancha en el video, sin que nadie dé clics:
1. Junta ~30 cuadros repartidos en el partido y saca la mediana → queda la cancha vacía
   (los jugadores se mueven, el pasto no).
2. Busca el color del pasto en la parte de abajo/centro de la imagen (azul, verde,
   terracota… el que sea) y marca toda la superficie de ese color conectada.
3. Ajusta un cuadrilátero a esa superficie → esquinas cerca-izq, cerca-der, fondo-der, fondo-izq.
4. Califica el resultado (qué tan "rectangular" es, si se sale de la imagen) y dibuja
   una imagen de revisión con el contorno encontrado.
"""
import base64
import math

import cv2
import numpy as np


def background(video_path, n=31, max_w=1280):
    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = min(1.0, max_w / float(fw or max_w))
    frames = []
    if total > 0:
        idxs = np.linspace(total * 0.03, total * 0.97, n).astype(int)
        for i in idxs:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
            ok, f = cap.read()
            if ok:
                frames.append(cv2.resize(f, None, fx=scale, fy=scale) if scale < 1 else f)
    if len(frames) < 5:   # contenedor sin índice: lee de corrido
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        k = 0
        while len(frames) < n:
            ok, f = cap.read()
            if not ok:
                break
            if k % 125 == 0:
                frames.append(cv2.resize(f, None, fx=scale, fy=scale) if scale < 1 else f)
            k += 1
    cap.release()
    if not frames:
        raise RuntimeError("No se pudieron leer cuadros del video")
    bg = np.median(np.stack(frames), axis=0).astype(np.uint8)
    return bg, (fw, fh), scale


def _turf_mask(bg):
    h, w = bg.shape[:2]
    hsv = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    # zona donde casi seguro hay pasto: abajo al centro
    y0, y1, x0, x1 = int(0.50 * h), int(0.85 * h), int(0.30 * w), int(0.70 * w)
    roi_h, roi_s, roi_v = H[y0:y1, x0:x1], S[y0:y1, x0:x1], V[y0:y1, x0:x1]
    colored = (roi_s > 50) & (roi_v > 40)
    if colored.sum() < 0.2 * colored.size:
        return None, None
    hist = np.bincount(roi_h[colored].ravel(), minlength=180).astype(float)
    hist = np.convolve(np.r_[hist[-5:], hist, hist[:5]], np.ones(11) / 11, mode="same")[5:-5]
    hue = int(np.argmax(hist))
    sat_ref = float(np.median(roi_s[colored & (np.minimum(abs(roi_h - hue), 180 - abs(roi_h - hue)) <= 10)]))
    dh = np.minimum(abs(H - hue), 180 - abs(H - hue))
    mask = ((dh <= 12) & (S > max(35, 0.45 * sat_ref)) & (V > 35)).astype(np.uint8) * 255
    # rellena las líneas blancas y quita puentes delgados hacia otras canchas
    k = max(3, w // 160)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * k, 3 * k)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k, 2 * k)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return None, None
    seed_lab = lab[y0:y1, x0:x1]
    counts = np.bincount(seed_lab.ravel(), minlength=n)
    counts[0] = 0
    best = int(np.argmax(counts))
    comp = (lab == best).astype(np.uint8) * 255
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(comp)
    cv2.drawContours(filled, cnts, -1, 255, -1)
    return filled, hue


def _order(pts):
    """→ cerca-izq, cerca-der, fondo-der, fondo-izq (cerca = abajo en la imagen)."""
    pts = sorted(pts, key=lambda p: p[1])
    far, near = sorted(pts[:2], key=lambda p: p[0]), sorted(pts[2:], key=lambda p: p[0])
    return [near[0], near[1], far[1], far[0]]


def _line_from_points(pts):
    vx, vy, x0, y0 = cv2.fitLine(np.float32(pts), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    return (x0, y0, vx, vy)


def _intersect(l1, l2):
    x1, y1, a1, b1 = l1
    x2, y2, a2, b2 = l2
    den = a1 * b2 - b1 * a2
    if abs(den) < 1e-6:
        return None
    t = ((x2 - x1) * b2 - (y2 - y1) * a2) / den
    return (x1 + a1 * t, y1 + b1 * t)


def _quad(mask):
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    approx = None
    for f in np.linspace(0.01, 0.12, 23):
        a = cv2.approxPolyDP(hull, f * peri, True)
        if len(a) == 4:
            approx = a.reshape(-1, 2).astype(float)
            break
        if len(a) < 4:
            break
    if approx is None:   # esquinas extremas
        p = hull.reshape(-1, 2).astype(float)
        s, d = p.sum(1), p[:, 0] - p[:, 1]
        approx = np.array([p[np.argmin(s)], p[np.argmax(d)], p[np.argmax(s)], p[np.argmin(d)]])
    q = _order([tuple(x) for x in approx])
    # Afinar: recta ajustada a los puntos del contorno cerca de cada lado → esquinas más precisas
    pts = c.reshape(-1, 2).astype(float)
    lines = []
    for i in range(4):
        a, b = np.array(q[i]), np.array(q[(i + 1) % 4])
        ab = b - a
        L = np.linalg.norm(ab) or 1
        t = ((pts - a) @ ab) / (L * L)
        rel = pts - a
        dist = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / L
        sel = pts[(t > 0.15) & (t < 0.85) & (dist < max(4, 0.02 * L))]
        lines.append(_line_from_points(sel) if len(sel) >= 10 else None)
    refined = []
    for i in range(4):
        l_prev, l_next = lines[(i - 1) % 4], lines[i]
        p = _intersect(l_prev, l_next) if l_prev and l_next else None
        refined.append(p if p and math.dist(p, q[i]) < 0.15 * peri / 4 else q[i])
    return [tuple(map(float, p)) for p in refined], float(cv2.contourArea(c))


def _white_lines(bg, mask, corners):
    """Líneas blancas "horizontales" (paralelas al fondo) sobre el pasto → distancia desde el fondo
    medida sobre cada lateral."""
    h, w = bg.shape[:2]
    hsv = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV)
    k = max(3, w // 200)
    inner = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (2 * k, 2 * k)))
    white = ((hsv[..., 2] > 160) & (hsv[..., 1] < 70) & (inner > 0)).astype(np.uint8) * 255
    far_l, far_r = np.array(corners[3]), np.array(corners[2])
    far_w = np.linalg.norm(far_r - far_l)
    segs = cv2.HoughLinesP(white, 1, np.pi / 360, 40, minLineLength=max(20, 0.3 * far_w), maxLineGap=12)
    if segs is None:
        return []
    base_ang = math.atan2(*(far_r - far_l)[::-1])
    left = (corners[3][0], corners[3][1], corners[0][0] - corners[3][0], corners[0][1] - corners[3][1])
    right = (corners[2][0], corners[2][1], corners[1][0] - corners[2][0], corners[1][1] - corners[2][1])
    out = []
    for x1, y1, x2, y2 in segs.reshape(-1, 4):
        ang = math.atan2(y2 - y1, x2 - x1)
        d = abs((ang - base_ang + math.pi / 2) % math.pi - math.pi / 2)
        if d > math.radians(8):
            continue
        ln = (x1, y1, x2 - x1, y2 - y1)
        pl, pr = _intersect(ln, left), _intersect(ln, right)
        if not pl or not pr:
            continue
        sl = _along(corners[3], corners[0], pl)
        sr = _along(corners[2], corners[1], pr)
        out.append((sl, sr, math.hypot(x2 - x1, y2 - y1)))
    # agrupa bordes de la misma línea
    out.sort()
    groups = []
    for sl, sr, L in out:
        if groups and abs(groups[-1][0] - sl) < max(4, 0.01 * h):
            g = groups[-1]
            tot = g[2] + L
            groups[-1] = ((g[0] * g[2] + sl * L) / tot, (g[1] * g[2] + sr * L) / tot, tot)
        else:
            groups.append((sl, sr, L))
    return groups


def _along(a, b, p):
    """Distancia de a hacia p medida en la dirección a→b (px)."""
    a, b, p = np.array(a, float), np.array(b, float), np.array(p, float)
    u = (b - a) / (np.linalg.norm(b - a) or 1)
    return float((p - a) @ u)


def _fix_near(bg, mask, corners):
    """Cuando la línea de fondo cercana queda fuera de la imagen, la calcula con perspectiva:
    punto de fuga de los laterales + línea de saque del fondo (a 16.95 m) → dónde cae el 0 m.
    Si también se ve la línea de saque cercana (3.05 m) sirve para comprobar."""
    left = _line_from_points([corners[3], corners[0]])
    right = _line_from_points([corners[2], corners[1]])
    V = _intersect(left, right)
    if V is None:
        return None
    sVl = _along(corners[3], corners[0], V)
    sVr = _along(corners[2], corners[1], V)
    if sVl >= 0 or sVr >= 0:      # el punto de fuga debe quedar "detrás" del fondo
        return None
    groups = [g for g in _white_lines(bg, mask, corners) if g[0] > 3 and g[1] > 3]
    if not groups:
        return None
    two = len(groups) >= 2
    new, checks = [], []
    for side, (far, near, sV) in enumerate(((corners[3], corners[0], sVl), (corners[2], corners[1], sVr))):
        s1 = groups[0][side]                       # saque del fondo (16.95 m)
        if two:                                    # + saque cercano (3.05 m): no depende de la esquina del fondo
            s2 = groups[-1][side]
            r = (s1 - sV) / (s2 - sV)
            if abs(r - 1) < 1e-6:
                return None
            m = (3.05 - 16.95 * r) / (r - 1)
            K = (s1 - sV) * (16.95 + m)
        else:                                      # fondo (20 m, s=0) + saque del fondo
            # s(20)=0 y s(16.95)=s1 con s = sV + K/(y+m)
            # → -sV(20+m) = K = (s1-sV)(16.95+m)
            den = (s1 - sV) + sV
            if abs(den) < 1e-9:
                return None
            m = (-sV * 20 - (s1 - sV) * 16.95) / den
            K = -sV * (20 + m)
        if abs(m) < 1e-6:
            return None
        s0 = sV + K / m
        if not (s0 > s1 > 0):
            return None
        a_, b_ = np.array(far, float), np.array(near, float)
        u = (b_ - a_) / np.linalg.norm(b_ - a_)
        new.append(tuple(map(float, a_ + u * s0)))
        if two:
            s20 = sV + K / (20 + m)
            checks.append(abs(s20) < max(6, 0.04 * s0))     # ¿cuadra con el fondo que sí se ve?
            far_fix = a_ + u * s20
            new.append(tuple(map(float, far_fix)))
    if two:
        nl, fl, nr, fr = new
        seen = all(checks)
        return [nl, nr, fr if seen else corners[2], fl if seen else corners[3]], seen
    seen = False
    return [new[0], new[1], corners[2], corners[3]], seen


def auto_calibrate(video_path):
    """→ (calibración o None, imagen de revisión JPG en base64, info)."""
    bg, (fw, fh), scale = background(video_path)
    h, w = bg.shape[:2]
    mask, hue = _turf_mask(bg)
    info = {"method": "auto"}
    if mask is None or mask.sum() == 0:
        info["error"] = "no encontré el pasto de la cancha"
        return None, _review(bg, None, info), info
    corners, area = _quad(mask)
    cut = [i for i in (0, 1) if corners[i][1] > h - 4 or corners[i][0] < 3 or corners[i][0] > w - 4]
    info["near_fixed"] = False
    if cut:
        fx = _fix_near(bg, mask, corners)
        if fx:
            corners, info["near_checked"] = fx
            info["near_fixed"] = True
    quad_area = cv2.contourArea(np.float32(corners))
    frac = area / float(w * h)
    solidity = area / quad_area if quad_area else 0
    near_w = math.dist(corners[0], corners[1])
    far_w = math.dist(corners[2], corners[3])
    touches = 0 if info["near_fixed"] else len(cut)
    if info["near_fixed"]:
        solidity = 1.0          # la parte de abajo queda fuera de la imagen a propósito
        score_fix = 0.95 if info.get("near_checked") else 0.8
    score = 1.0
    score *= min(1.0, frac / 0.15)                      # la cancha debe ocupar buena parte de la imagen
    score *= max(0.0, 1 - abs(1 - solidity) * 3)        # la superficie debe parecer un cuadrilátero
    score *= 1.0 if far_w <= near_w * 1.05 else 0.6     # perspectiva: el fondo se ve más angosto
    score *= 0.7 ** touches                             # esquinas pegadas al borde → probablemente cortadas
    if info["near_fixed"]:
        score *= score_fix
    info.update({"hue": hue, "area_frac": round(frac, 3), "solidity": round(solidity, 3),
                 "corners_at_edge": touches, "score": round(score, 2)})
    cal = {"corners": [[round(x / scale, 1), round(y / scale, 1)] for x, y in corners],
           "width": fw, "height": fh, "method": "auto", "score": round(score, 2)}
    ok = score >= 0.45
    info["ok"] = ok
    return (cal if ok else None), _review(bg, corners, info), info


def _review(bg, corners, info):
    img = bg.copy()
    h, w = img.shape[:2]
    if corners:
        pts = np.int32(corners)
        over = img.copy()
        cv2.fillPoly(over, [pts], (0, 255, 200))
        img = cv2.addWeighted(over, 0.25, img, 0.75, 0)
        cv2.polylines(img, [pts], True, (0, 255, 200), max(2, w // 400))
        for (x, y), name in zip(corners, ["A", "B", "D", "C"]):  # cuadrantes en cada esquina
            cv2.circle(img, (int(x), int(y)), max(5, w // 160), (0, 230, 255), -1)
        # red (mitad de la cancha en metros → línea en la imagen)
        try:
            Hinv = cv2.getPerspectiveTransform(np.float32([[0, 0], [10, 0], [10, 20], [0, 20]]), np.float32(corners))
            net = cv2.perspectiveTransform(np.float32([[[0, 10]], [[10, 10]]]), Hinv).reshape(-1, 2)
            cv2.line(img, tuple(np.int32(net[0])), tuple(np.int32(net[1])), (255, 255, 255), max(1, w // 600))
        except cv2.error:
            pass
    txt = (f"Calibracion automatica · confianza {info.get('score', 0):.0%}"
           if corners else f"Calibracion automatica fallo: {info.get('error')}")
    cv2.rectangle(img, (0, 0), (w, 34), (0, 0, 0), -1)
    cv2.putText(img, txt, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 200) if corners else (0, 80, 255), 2)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return base64.b64encode(buf.tobytes()).decode()
