# usage: python3 tools/make_intro.py   (run from the site folder; needs ffmpeg + ffprobe)
# Builds the opening intro: 4.2 s of quick cuts (9 beats of 0.47 s). The page then shows the logo and reveals itself.
#   assets/video/intro.mp4/.webm         wide screens     assets/video/intro-mobile.mp4/.webm   phones
# SHOTS: the strongest moments, in order. A video shot is (file, start, end); a photo is (file,).
# The walkthrough is one continuous take, so each "shot" is a 0.6 s window of it.
# Portrait (9:16) footage -> three panels side by side on wide screens (each panel starts the list at a different shot).
import subprocess, os, json
W = "_source/walkthrough-graded.mp4"
SHOTS = [
    (W, 0.30, 0.90),    # sun flare over the plaza
    (W, 10.10, 10.70),  # hand on the door
    (W, 15.60, 16.20),  # cold drinks
    (W, 31.80, 32.40),  # fresh rolls
    (W, 19.20, 19.80),  # deli counter
    (W, 24.20, 24.80),  # YES WE DELIVER banner
    (W, 12.50, 13.10),  # dessert menu on screen
    (W, 27.20, 27.80),  # glowing dessert case
    (W, 8.80, 9.40),    # SEALAND FOODS sign (strongest, last)
    (W, 16.60, 17.20),  # extras for panels 2 and 3
    (W, 29.00, 29.60),
    (W, 20.20, 20.80),
]
PRECROP = {}

# Cut each window to its own small clip first (one 4K file trimmed 27 times in one graph would buffer gigabytes).
os.makedirs("_source/intro-shots", exist_ok=True)
_cut = []
for k, sh in enumerate(SHOTS):
    if len(sh) == 1:
        _cut.append(sh); continue
    out = f"_source/intro-shots/shot{k:02d}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{sh[1]:.3f}", "-t", f"{sh[2] - sh[1]:.3f}", "-i", sh[0], "-an",
                    "-vf", "scale=540:960:flags=lanczos", "-c:v", "libx264", "-crf", "12", "-preset", "fast", out], check=True)
    _cut.append((out, 0.0, sh[2] - sh[1]))
SHOTS = _cut
DUR, N, FPS = 4.2, 9, 30
SEG = DUR / N
GRADE = "eq=contrast=1.08:saturation=1.15"

def probe(f):
    if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        from PIL import Image; w, h = Image.open(f).size; return w, h
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
                                   "-of", "json", f], capture_output=True, text=True, check=True).stdout)["streams"][0]
    w, h = s["width"], s["height"]
    rot = abs(int(next((d.get("rotation", 0) for d in s.get("side_data_list", [])), 0)))
    return (h, w) if rot in (90, 270) else (w, h)

files = sorted({s[0] for s in SHOTS}); idx = {f: i for i, f in enumerate(files)}
inputs = []
for f in files:
    inputs += ["-i", f]

def beat(shot, k, W, H, label):
    f = shot[0]; pre = (PRECROP.get(f, "") + ",") if PRECROP.get(f) else ""
    fit = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
    if len(shot) == 1:
        frames = round(SEG * FPS)
        return (f"[{idx[f]}:v]{pre}scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
                f"zoompan=z='1+0.004*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1[{label}{k}]")
    a, b = shot[1], shot[2]; ln = min(b - a, 0.6); s = a + (b - a - ln) / 2
    return f"[{idx[f]}:v]trim=start={s:.3f}:duration={ln:.3f},setpts=PTS-STARTPTS,setpts={SEG / ln:.4f}*PTS,fps={FPS},{pre}{fit}[{label}{k}]"

def montage(shots, W, H, label):
    # the one input is used many times, so split it first
    parts = [beat(sh, k, W, H, label) for k, sh in enumerate(shots)]
    ins = "".join(f"[{label}{k}]" for k in range(len(shots)))
    parts.append(f"{ins}concat=n={len(shots)}:v=1:a=0,trim=duration={DUR},setpts=PTS-STARTPTS,{GRADE},format=yuv420p[{label}]")
    return ";".join(parts)

def splitify(fc):
    # one input file feeds many beats: give each use its own copy via split
    import re
    for f, i in idx.items():
        uses = fc.count(f"[{i}:v]")
        if uses > 1:
            outs = "".join(f"[s{i}_{u}]" for u in range(uses))
            n = iter(range(uses))
            fc = re.sub(re.escape(f"[{i}:v]"), lambda m: f"[s{i}_{next(n)}]", fc)
            fc = f"[{i}:v]split={uses}{outs};" + fc
    return fc

def encode(fc, label, name, crf):
    mp4 = f"assets/video/{name}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", splitify(fc), "-map", f"[{label}]", "-an", "-c:v", "libx264", "-preset", "slow",
                    "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-deadline", "good", "-cpu-used", "2",
                    "-row-mt", "1", "-an", f"assets/video/{name}.webm"], check=True)
    print(name, {e: f"{os.path.getsize(f'assets/video/{name}.{e}') // 1024} KB" for e in ("mp4", "webm")})

assert len(SHOTS) >= N, f"need at least {N} shots, got {len(SHOTS)}"
os.makedirs("assets/video", exist_ok=True)
w, h = probe(SHOTS[0][0])
first9 = SHOTS[:N]
if h > w:
    rot = lambda r: [SHOTS[(i + r) % len(SHOTS)] for i in range(N)]
    off = N if len(SHOTS) >= 3 * N else 3
    fc = ";".join(montage(rot(r * off), 404, 720, l) for r, l in ((0, "p0"), (1, "p1"), (2, "p2")))
    fc += ";[p0]pad=412:720:0:0:black[q0];[p1]pad=412:720:0:0:black[q1];[q0][q1][p2]hstack=3[wide]"
else:
    fc = montage(first9, 1280, 720, "wide")
encode(fc, "wide", "intro", 30)
encode(montage(first9, 540, 960, "ph"), "ph", "intro-mobile", 31)
