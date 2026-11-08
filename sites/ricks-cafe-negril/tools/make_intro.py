# usage: python3 tools/make_intro.py   (run from the site folder; needs ffmpeg + ffprobe)
# Builds the opening intro from the official film "Rick's Cafe turns 47!" (_source/ricks-turns-47.mp4):
#   6 beats of real-speed footage joined by short dissolves (about 4.3 s), no audio.
#   assets/video/intro.mp4/.webm          wide screens (1280x720)
#   assets/video/intro-mobile.mp4/.webm   phones (540x960, cropped around each beat's focus point)
# The page then shows the logo and reveals itself (see the .opener block in index.html / js/main.js).
#
# SHOTS: (start_seconds, focus_x) inside the film. focus_x is where the subject sits across the frame
# (0 = left edge, 1 = right edge); it only matters for the 9:16 phone crop.
# The film has red/gold/green paper wipes at about 8.3, 14, 20, 27, 30, 33 and 38 s: keep beats clear of them.
# The hero video (tools/make_hero.py) uses different moments of the same film, so the intro doesn't give it away.
import os, subprocess

SRC = "_source/ricks-turns-47.mp4"
SHOTS = [
    (9.90, 0.55),   # drone: the cliffs and the main deck from above
    (31.00, 0.36),  # drone: the other side of the cove, boats below
    (12.80, 0.50),  # drone: closer on the deck and the pool
    (28.25, 0.38),  # historical pole dive (professional diver, from the 2021 film)
    (15.10, 0.50),  # sunset crowd in silhouette on the cliff edge
    (36.60, 0.50),  # sunset aerial: the sun's path on the sea (strongest shot last)
]
BEAT, XF, FPS = 0.88, 0.20, 30          # 6 x 0.88 - 5 x 0.20 = 4.28 s
GRADE = "eq=contrast=1.05:saturation=1.10"


def build(W, H, name, crf):
    ins, parts = [], []
    for i, (t, fx) in enumerate(SHOTS):
        ins += ["-ss", f"{t:.3f}", "-t", f"{BEAT:.3f}", "-i", SRC]
        if W > H:   # wide: plain downscale of the 16:9 film
            fit = f"scale={W}:{H}:flags=lanczos"
        else:       # tall: cut a 9:16 window around the focus point, then scale
            cw = 608                                   # 9:16 window of the 1920x1080 film
            x = int(max(0, min(1920 - cw, 1920 * fx - cw / 2))) // 2 * 2
            fit = f"crop={cw}:1080:{x}:0,scale={W}:{H}:flags=lanczos"
        parts.append(f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS},{fit},setsar=1,format=yuv420p,settb=AVTB[s{i}]")
    last, dur = "s0", BEAT
    for i in range(1, len(SHOTS)):
        off = dur - XF
        parts.append(f"[{last}][s{i}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]")
        last, dur = f"x{i}", dur + BEAT - XF
    parts.append(f"[{last}]{GRADE},format=yuv420p[out]")   # no fade-in: frame 0 doubles as the poster
    mp4, webm = f"assets/video/{name}.mp4", f"assets/video/{name}.webm"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(parts), "-map", "[out]", "-an",
                    "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "46", "-b:v", "0",
                    "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-an", webm], check=True)
    # poster = frame 0, so the opener shows real footage the instant the page paints (also the page's LCP image)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-frames:v", "1", "-c:v", "libwebp", "-quality", "70", f"assets/video/{name}-poster.webp"], check=True)
    print(name, f"{dur:.2f}s", {e: f"{os.path.getsize(f'assets/video/{name}.{e}') // 1024} KB" for e in ("mp4", "webm")})


os.makedirs("assets/video", exist_ok=True)
build(1280, 720, "intro", 27)          # budget: <= 1.2 MB
build(540, 960, "intro-mobile", 28)    # budget: <= 600 KB
