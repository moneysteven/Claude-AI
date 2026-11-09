# usage: python3 -I tools/make_hero.py   (run from the site folder; needs ffmpeg)
# Builds the home-page hero panel video from the restaurant's own photos: slow push-ins and pull-backs with crossfades,
# in a tall 4:5 frame. It loops seamlessly (it ends on the same frame it starts with).
#   assets/video/hero.mp4/.webm (1080x1350)   assets/video/hero-mobile.mp4 (720x900, phones)   assets/img/hero-poster.jpg
# To use a supplied video instead, replace those files (a tall or square video crops best into the 4:5 panel).
import subprocess, os
PH = "_source/renamed/"
SHOTS = [  # (photo, focus_x, focus_y, zoom "in" or "out") - only photos sharp enough for a 1080x1350 frame
    ("garden-night.jpg", 0.4, 0.5, "in"),        # first and last frame
    ("lobster-linguine.jpg", 0.5, 0.5, "out"),
    ("kenny.jpg", 0.5, 0.3, "in"),
    ("pepperoni-pizza.jpg", 0.5, 0.5, "out"),
    ("cocktail-appleton.jpg", 0.5, 0.45, "in"),
    ("cabana-night.jpg", 0.4, 0.5, "out"),
]
W, H, FPS, L, X, Z = 1080, 1350, 30, 4.2, 1.0, 0.09     # size, fps, clip length, crossfade, zoom amount

def clip(k, f, fx, fy, mode, length, static=False):
    d = round(length * FPS)
    z = "1" if static else (f"1+{Z}*on/{d - 1}" if mode == "in" else f"{1 + Z}-{Z}*on/{d - 1}")
    return (f"[{k}:v]scale={W*3}:{H*3}:force_original_aspect_ratio=increase,crop={W*3}:{H*3}:(iw-{W*3})*{fx}:(ih-{H*3})*{fy},"
            f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={d}:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p[c{k}]")

inputs, parts = [], []
for k, (f, fx, fy, mode) in enumerate(SHOTS):
    inputs += ["-i", PH + f]; parts.append(clip(k, f, fx, fy, mode, L))
n = len(SHOTS)  # last clip: the first photo again, held still, so the loop point is invisible
f, fx, fy, _ = SHOTS[0]; inputs += ["-i", PH + f]; parts.append(clip(n, f, fx, fy, "in", X + 0.04, static=True))
prev, off = "c0", 0.0
for k in range(1, n + 1):
    off += (L if k == 1 else L) - X
    parts.append(f"[{prev}][c{k}]xfade=transition=fade:duration={X}:offset={off:.3f}[x{k}]"); prev = f"x{k}"
parts.append(f"[{prev}]eq=contrast=1.04:saturation=1.06[v]")
os.makedirs("assets/video", exist_ok=True)
mp4 = "assets/video/hero.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(parts), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow",
                "-crf", "26", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf", "scale=720:900:flags=lanczos", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "29",
                "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "assets/video/hero-mobile.mp4"], check=True)  # phones: mp4 only
for name in ("hero",):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"assets/video/{name}.mp4", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-deadline", "good",
                    "-cpu-used", "2", "-row-mt", "1", "-an", f"assets/video/{name}.webm"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-frames:v", "1", "-q:v", "4", "assets/img/hero-poster.jpg"], check=True)
for name in ("hero.mp4", "hero.webm", "hero-mobile.mp4"):
    print(name, os.path.getsize("assets/video/" + name) // 1024, "KB")
