# usage: python3 tools/make_hero.py   (run from the site folder; needs ffmpeg)
# Builds the looping, silent home-page hero from the official film "Rick's Cafe turns 47!" (c. 2021):
#   daytime drone over the cliffs -> sunset crowd in silhouette -> sunset aerial, joined by slow dissolves,
#   with a short fade at each end so the loop "breathes" instead of jumping.
#   assets/video/hero.mp4/.webm               1920x1080 (the film's own size; never upscaled)
#   assets/video/hero-mobile.mp4/.webm        608x1080 window cut from the film for phones
#   assets/img/hero-poster.jpg, hero-poster-mobile.jpg, og-image.jpg (1200x630)
# SEGMENTS: (start, end, focus_x). focus_x only matters for the phone crop (0 = left edge, 1 = right edge).
import os, subprocess

SRC = "_source/ricks-turns-47.mp4"
SEGMENTS = [
    (21.45, 26.35, 0.46),   # drone: the main deck, cliffs and cove in daylight
    (17.00, 19.55, 0.50),   # guests in silhouette watching the sun go down (no identifiable faces)
    (34.00, 36.60, 0.50),   # sunset aerial over the sea
]
XF, FPS, EDGE = 0.8, 30, 0.45


def build(W, H, name, crf, phone):
    ins, parts = [], []
    for i, (a, b, fx) in enumerate(SEGMENTS):
        ins += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", SRC]
        x = int(max(0, min(1920 - 608, 1920 * fx - 304))) // 2 * 2          # 9:16 window of the 1920x1080 film
        fit = f"crop=608:1080:{x}:0" if phone else f"scale={W}:{H}:flags=lanczos"
        parts.append(f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS},{fit},setsar=1,format=yuv420p,settb=AVTB[s{i}]")
    last, dur = "s0", SEGMENTS[0][1] - SEGMENTS[0][0]
    for i in range(1, len(SEGMENTS)):
        a, b, _ = SEGMENTS[i]
        parts.append(f"[{last}][s{i}]xfade=transition=fade:duration={XF}:offset={dur - XF:.3f}[x{i}]")
        last, dur = f"x{i}", dur + (b - a) - XF
    parts.append(f"[{last}]fade=in:st=0:d={EDGE},fade=out:st={dur - EDGE:.3f}:d={EDGE},format=yuv420p[out]")
    mp4 = f"assets/video/{name}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(parts), "-map", "[out]", "-an",
                    "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0",
                    "-deadline", "good", "-cpu-used", "3", "-row-mt", "1", "-an", f"assets/video/{name}.webm"], check=True)
    print(name, f"{dur:.2f}s", {e: f"{os.path.getsize(f'assets/video/{name}.{e}') // 1024} KB" for e in ("mp4", "webm")})
    return mp4


os.makedirs("assets/video", exist_ok=True); os.makedirs("assets/img", exist_ok=True)
wide = build(1920, 1080, "hero", 25, False)        # budget: <= 6 MB
tall = build(608, 1080, "hero-mobile", 27, True)
# posters: a frame 1.2 s in (past the fade-in), plus a 1200x630 social card
run = lambda *a: subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)
run("-ss", "1.2", "-i", wide, "-frames:v", "1", "-q:v", "4", "assets/img/hero-poster.jpg")
run("-ss", "1.2", "-i", tall, "-frames:v", "1", "-q:v", "4", "assets/img/hero-poster-mobile.jpg")
run("-ss", "1.2", "-i", wide, "-frames:v", "1", "-vf", "scale=1200:-2,crop=1200:630", "-q:v", "4", "assets/img/og-image.jpg")
print({p: f"{os.path.getsize(p) // 1024} KB" for p in ("assets/img/hero-poster.jpg", "assets/img/hero-poster-mobile.jpg", "assets/img/og-image.jpg")})
