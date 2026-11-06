"""Video con FFmpeg: foto final y unión de pedazos (sin recodificar)."""
import subprocess
from pathlib import Path


def _run(cmd, timeout):
    try:
        p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=timeout)
        return p.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def last_frame(video: Path, out: Path) -> bool:
    """Foto de los últimos segundos del partido (para que nombren a los jugadores)."""
    tmp = out.with_suffix(".tmp.jpg")
    for args in (["-sseof", "-2"], ["-ss", "0"]):
        if _run(["ffmpeg", "-y", "-loglevel", "error", *args, "-i", str(video),
                 "-frames:v", "1", "-q:v", "3", "-vf", "scale='min(1280,iw)':-2", str(tmp)], 60) and tmp.exists():
            tmp.replace(out)
            return True
    return False


def concat(segments, out: Path) -> bool:
    lst = out.with_name("lista.txt")
    lst.write_text("".join(f"file '{s.name}'\n" for s in segments))
    tmp = out.with_suffix(".tmp.mp4")
    ok = _run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
               "-c", "copy", "-movflags", "+faststart", str(tmp)], 1800)
    lst.unlink(missing_ok=True)
    if ok and tmp.exists() and tmp.stat().st_size > 0:
        tmp.replace(out)
        return True
    tmp.unlink(missing_ok=True)
    return False


def cut_clip(video: Path, start: float, end: float, out: Path, thumb: Path) -> bool:
    """Corta un clip exacto (recodifica solo ese pedazo, H.264 para que se vea en cualquier celular)."""
    tmp = out.with_suffix(".tmp.mp4")
    ok = _run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", str(video), "-t", f"{end - start:.2f}",
               "-map", "0:v:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
               "-vf", "scale=-2:'min(1080,ih)'", "-movflags", "+faststart", "-an", str(tmp)], 600)
    if not ok or not tmp.exists():
        tmp.unlink(missing_ok=True)
        return False
    tmp.replace(out)
    _run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{min(1.5, (end - start) / 2):.2f}", "-i", str(out),
          "-frames:v", "1", "-q:v", "4", "-vf", "scale=480:-2", str(thumb)], 60)
    return True


def keyframe_before(video: Path, t: float) -> float:
    """Tiempo del cuadro clave (keyframe) en o antes de t: ahí puede empezar un corte sin recodificar."""
    try:
        p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
                            "-show_entries", "frame=pts_time,best_effort_timestamp_time", "-of", "csv=p=0",
                            "-read_intervals", f"{max(0.0, t - 20):.2f}%{t + 0.05:.2f}", str(video)],
                           capture_output=True, text=True, timeout=120)
        best = 0.0
        for line in p.stdout.splitlines():
            for v in line.split(","):
                try:
                    x = float(v)
                except ValueError:
                    continue
                if x <= t + 0.01:
                    best = max(best, x)
                break
        return best
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return max(0.0, t)


def cut_copy(video: Path, start: float, end: float, out: Path) -> bool:
    """Saca un pedazo largo sin recodificar (rápido, no carga el VPS). start debe ser un keyframe."""
    tmp = out.with_suffix(".tmp.mp4")
    ok = _run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", str(video), "-t", f"{end - start:.3f}",
               "-map", "0:v:0", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", str(tmp)], 900)
    if ok and tmp.exists() and tmp.stat().st_size > 0:
        tmp.replace(out)
        return True
    tmp.unlink(missing_ok=True)
    return False
