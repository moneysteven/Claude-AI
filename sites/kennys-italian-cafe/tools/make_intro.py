# usage: python3 -I tools/make_intro.py   (run from the site folder; needs ffmpeg + ffprobe)
# Builds the opening intro: 4.2 s of quick cuts (9 beats of 0.47 s). The page then shows the logo and reveals itself.
#   assets/video/intro.mp4/.webm  (16:9, wide screens)      assets/video/intro-mobile.mp4/.webm  (9:16, phones)
# A video shot is (file, start, end) inside one camera shot (between the editor's cuts); a photo is (file, focus_x, focus_y).
# Find the cuts in a video with:  ffmpeg -i x.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*'
import subprocess, os
FV = "_source/Full-videos/"; PH = "_source/renamed/"
FOOD = FV + "KennysItalianCafe-FoodBoss-Jamaica-Italian-Food-part1.mp4"
WIDE = [  # builds to the strongest shot: the lit sign at night
    (FOOD, 98.0, 106.0),            # the dining room by day
    (FOOD, 184.0, 192.0),           # dough stretched by hand
    (FOOD, 240.0, 248.0),           # sauce on the base
    (PH + "kenny.jpg", 0.5, 0.18),  # Kenny behind the bar
    (FOOD, 286.0, 292.0),           # pepperoni going on
    (FOOD, 395.0, 400.0),           # flames under the pan
    (PH + "lobster-linguine.jpg", 0.5, 0.5),
    (PH + "garden-night.jpg", 0.5, 0.45),
    (PH + "exterior-night.jpg", 0.3, 0.5),
]
PHONE = [
    (FV + "KennysItalianCafe-XsLxLickleJa-Norman-Manley-Blvd-part2.mp4", 50.0, 60.0),   # the bar in neon
    (FOOD, 184.0, 192.0),
    (PH + "kenny.jpg", 0.5, 0.3),
    (FOOD, 395.0, 400.0),
    (PH + "cocktail-appleton.jpg", 0.5, 0.5),
    (FV + "KennysItalianCafe-FreshFiDayz-Uptown-Fridayz.mp4", 86.0, 90.0),              # DJ decks, Uptown Fridayz
    (PH + "lobster-linguine.jpg", 0.55, 0.5),
    (FV + "KennysItalianCafe-SwopesSaidIt-short.mp4", 24.0, 33.0),                      # the garden crowd at night
    (PH + "exterior-night.jpg", 0.14, 0.5),
]
PRECROP = {FV + "KennysItalianCafe-SwopesSaidIt-short.mp4": "crop=324:590:0:24"}       # cut the letterbox bars
DUR, N, FPS = 4.2, 9, 30
SEG = DUR / N
GRADE = "eq=contrast=1.08:saturation=1.15"

def build(shots, W, H, name, crf):
    inputs, parts = [], []
    for k, sh in enumerate(shots):
        f = sh[0]; pre = (PRECROP[f] + ",") if f in PRECROP else ""
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):    # photo: one frame in, zoompan makes a quick push-in
            fx, fy = sh[1], sh[2]; inputs += ["-i", f]; frames = round(SEG * FPS)
            parts.append(f"[{k}:v]scale={W*2}:{H*2}:force_original_aspect_ratio=increase,"
                         f"crop={W*2}:{H*2}:(iw-{W*2})*{fx}:(ih-{H*2})*{fy},"
                         f"zoompan=z='1+0.004*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1[b{k}]")
        else:                                                           # video: the middle 0.6 s of the stretch, slowed to fit the beat
            a, b = sh[1], sh[2]; ln = min(b - a, 0.6); s = a + (b - a - ln) / 2
            inputs += ["-ss", f"{s:.3f}", "-t", f"{ln:.3f}", "-i", f]
            parts.append(f"[{k}:v]setpts=PTS-STARTPTS,setpts={SEG / ln:.4f}*PTS,fps={FPS},{pre}"
                         f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,trim=duration={SEG:.4f}[b{k}]")
    parts.append("".join(f"[b{k}]" for k in range(len(shots))) + f"concat=n={len(shots)}:v=1:a=0,trim=duration={DUR},setpts=PTS-STARTPTS,{GRADE},format=yuv420p[v]")
    mp4 = f"assets/video/{name}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(parts), "-map", "[v]", "-an", "-c:v", "libx264",
                    "-preset", "slow", "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-deadline", "good",
                    "-cpu-used", "2", "-row-mt", "1", "-an", f"assets/video/{name}.webm"], check=True)
    print(name, {e: f"{os.path.getsize(f'assets/video/{name}.{e}') // 1024} KB" for e in ("mp4", "webm")})

assert len(WIDE) >= N and len(PHONE) >= N
os.makedirs("assets/video", exist_ok=True)
build(WIDE[:N], 1280, 720, "intro", 27)
build(PHONE[:N], 540, 960, "intro-mobile", 30)
