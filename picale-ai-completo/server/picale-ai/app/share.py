"""PÍCALE AI · tarjeta para redes (estilo Strava): el clip arriba y las stats del jugador abajo.

Sale en vertical 1080×1920 (historias de Instagram / TikTok / estados de WhatsApp):
  · video .mp4 con el clip corriendo
  · imagen .jpg (la misma tarjeta con un cuadro del clip) para compartir rápido
"""
import glob
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
VID_Y, VID_H = 250, 608          # el clip va en 16:9 a todo lo ancho
BG = (10, 10, 10)
GREEN = (94, 232, 122)
TEXT = (244, 244, 242)
MUTED = (150, 154, 148)
LINE = (38, 40, 38)

_FONTS = {}


def _font(weight, size, display=False):
    """Inter (o Inter Display) del sistema; si no está, DejaVu."""
    key = (weight, size, display)
    if key in _FONTS:
        return _FONTS[key]
    fam = "InterDisplay" if display else "Inter"
    pats = [f"/usr/share/fonts/**/{fam}-{weight}.otf", f"/usr/share/fonts/**/{fam}-{weight}.ttf",
            f"/usr/share/fonts/**/Inter-{weight}.otf", f"/usr/share/fonts/**/Inter-{weight}.ttf"]
    path = next((f for p in pats for f in glob.glob(p, recursive=True)), None)
    if not path:
        path = next(iter(glob.glob("/usr/share/fonts/**/DejaVuSans-Bold.ttf", recursive=True)), None)
    f = ImageFont.truetype(path, size) if path else ImageFont.load_default()
    _FONTS[key] = f
    return f


def _fit(draw, text, weight, size, max_w, display=False, min_size=40):
    """Achica el texto hasta que quepa."""
    while size > min_size:
        f = _font(weight, size, display)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 4
    return _font(weight, min_size, display)


def stat_items(stats):
    """Las 4 stats que van en la tarjeta (las que haya)."""
    s = stats or {}
    out = []
    if s.get("distance_m") is not None:
        out.append((f"{s['distance_m'] / 1000:.2f}", "km", "Distancia"))
    if s.get("total_shots") is not None:
        out.append((str(s["total_shots"]), "", "Golpes"))
    if s.get("max_speed_kmh") is not None:
        out.append((f"{s['max_speed_kmh']:.1f}", "km/h", "Velocidad máx."))
    if s.get("net_pct") is not None:
        out.append((f"{round(s['net_pct'])}", "%", "Cerca de la red"))
    if s.get("active_min") is not None:
        out.append((f"{round(s['active_min'])}", "min", "En movimiento"))
    return out[:4]


def card(name, kicker, clip_title, date_txt, stats, frame=None):
    """Tarjeta completa (PIL Image RGB). Si frame se da, se pega en el hueco del video."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # brillo verde arriba
    glow = Image.new("RGB", (W, 520), BG)
    gd = ImageDraw.Draw(glow)
    for r in range(260, 0, -4):
        a = int(26 * (1 - r / 260))
        gd.ellipse((W // 2 - r * 3, -r, W // 2 + r * 3, r), fill=(10 + a // 3, 10 + a, 10 + a // 2))
    im.paste(glow, (0, 0))
    d = ImageDraw.Draw(im)

    # logo PÍCALE + AI
    f_logo = _font("Black", 64, True)
    x = 64
    d.text((x, 92), "PÍ", font=f_logo, fill=TEXT)
    x += d.textlength("PÍ", font=f_logo)
    d.text((x, 92), "CALE", font=f_logo, fill=GREEN)
    x += d.textlength("CALE", font=f_logo) + 16
    f_ai = _font("Black", 30)
    aw = d.textlength("AI", font=f_ai) + 28
    d.rounded_rectangle((x, 104, x + aw, 150), radius=12, fill=GREEN)
    d.text((x + 14, 108), "AI", font=f_ai, fill=(6, 18, 10))
    f_date = _font("SemiBold", 30)
    d.text((W - 64 - d.textlength(date_txt, font=f_date), 112), date_txt, font=f_date, fill=MUTED)

    # hueco del video
    if frame is not None:
        fr = frame.convert("RGB")
        scale = max(W / fr.width, VID_H / fr.height)
        fr = fr.resize((int(fr.width * scale + 0.5), int(fr.height * scale + 0.5)))
        left, top = (fr.width - W) // 2, (fr.height - VID_H) // 2
        im.paste(fr.crop((left, top, left + W, top + VID_H)), (0, VID_Y))
    else:
        d.rectangle((0, VID_Y, W, VID_Y + VID_H), fill=(20, 22, 20))
    d.rectangle((0, VID_Y + VID_H, W, VID_Y + VID_H + 6), fill=GREEN)

    # quién y qué
    y = VID_Y + VID_H + 64
    f_k = _font("Bold", 30)
    d.text((64, y), kicker.upper(), font=f_k, fill=GREEN)
    y += 54
    f_name = _fit(d, name.upper(), "Black", 104, W - 128, display=True)
    d.text((64, y), name.upper(), font=f_name, fill=TEXT)
    y += f_name.size + 18
    if clip_title:
        f_c = _font("Medium", 36)
        d.text((64, y), "▶  " + clip_title, font=f_c, fill=MUTED)
    y = 1290

    # stats 2×2
    items = stat_items(stats)
    cw, chh, gap = (W - 128 - 24) // 2, 230, 24
    for i, (val, unit, label) in enumerate(items):
        cx = 64 + (i % 2) * (cw + gap)
        cy = y + (i // 2) * (chh + gap)
        d.rounded_rectangle((cx, cy, cx + cw, cy + chh), radius=28, fill=(18, 19, 18), outline=LINE, width=2)
        f_v = _fit(d, val, "Black", 104, cw - 120, display=True, min_size=60)
        d.text((cx + 32, cy + 36), val, font=f_v, fill=TEXT)
        if unit:
            f_u = _font("Bold", 40)
            d.text((cx + 40 + d.textlength(val, font=f_v), cy + 36 + f_v.size - 52), unit, font=f_u, fill=GREEN)
        d.text((cx + 32, cy + chh - 62), label, font=_font("Medium", 32), fill=MUTED)

    # pie
    f_f = _font("SemiBold", 30)
    foot = "picalereplay.com"
    d.text(((W - d.textlength(foot, font=f_f)) / 2, H - 92), foot, font=f_f, fill=MUTED)
    return im


def render(clip_mp4: Path, thumb_jpg: Path, out_mp4: Path, out_jpg: Path, *, name, kicker, clip_title, date_txt, stats) -> bool:
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    frame = Image.open(thumb_jpg) if thumb_jpg and thumb_jpg.exists() else None
    card(name, kicker, clip_title, date_txt, stats, frame).save(out_jpg, quality=90)
    overlay = out_mp4.with_suffix(".overlay.png")
    base = card(name, kicker, clip_title, date_txt, stats, None)
    base.save(overlay)
    tmp = out_mp4.with_suffix(".tmp.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-i", str(overlay), "-i", str(clip_mp4),
           "-filter_complex",
           f"[1:v]scale={W}:{VID_H}:force_original_aspect_ratio=increase,crop={W}:{VID_H},setsar=1,fps=30[v];"
           f"[0:v][v]overlay=0:{VID_Y}:shortest=1,format=yuv420p[o]",
           "-map", "[o]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-threads", "2",
           "-r", "30", "-movflags", "+faststart", str(tmp)]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=300)
        ok = p.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0
    except subprocess.TimeoutExpired:
        ok = False
    overlay.unlink(missing_ok=True)
    if ok:
        tmp.replace(out_mp4)
    else:
        tmp.unlink(missing_ok=True)
    return ok
