# usage: python3 tools/make_intro.py   (run from the site folder; needs ffmpeg + ffprobe)
# Builds the opening intro: 4.2 s of quick cuts (9 beats of 0.47 s). The page then shows the logo and reveals itself.
#   assets/video/intro.mp4/.webm         wide screens     assets/video/intro-mobile.mp4/.webm   phones
# SHOTS: the strongest moments, in order. A video shot is (file, start, end) between the editor's cuts; a photo is (file,).
# Find the cuts in a video with:  ffmpeg -i _source/x.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*'
# Portrait (9:16) footage or photos → three panels side by side on wide screens (each panel starts the list at a different shot).
# Landscape footage or photos → one 16:9 montage. Phones always get a 9:16 version.
import subprocess, os, json
SHOTS = [
    # No client footage exists, so every beat is a photo: the client's own product packs on brand-colour frames
    # (made by tools/compose.py) and crops of the real Molynes Road storefront photo. Builds to the full line-up.
    ("_source/composed/beat-bmk-pad.jpg",), ("_source/composed/store-signs.jpg",), ("_source/composed/beat-ilink.jpg",),
    ("_source/composed/beat-helix-1l.jpg",), ("_source/composed/beat-aoteli.jpg",), ("_source/composed/store-wall.jpg",),
    ("_source/composed/beat-rimula.jpg",), ("_source/composed/beat-omala.jpg",), ("_source/composed/beat-lineup.jpg",),
]
PRECROP = {}          # optional per file, e.g. {"_source/promo.mp4": "crop=372:754:6:58"} to cut screen-recording borders
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
    inputs += ["-i", f]           # photos go in as a single frame: zoompan makes the frames

def beat(shot, k, W, H, label):
    """one 0.47 s beat, cover-cropped to W x H"""
    f = shot[0]; pre = (PRECROP.get(f, "") + ",") if PRECROP.get(f) else ""
    fit = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
    if len(shot) == 1:            # photo: a quick push-in
        frames = round(SEG * FPS)
        return (f"[{idx[f]}:v]{pre}scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
                f"zoompan=z='1+0.004*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1[{label}{k}]")
    a, b = shot[1], shot[2]; ln = min(b - a, 0.6); s = a + (b - a - ln) / 2
    return f"[{idx[f]}:v]trim=start={s:.3f}:duration={ln:.3f},setpts=PTS-STARTPTS,setpts={SEG / ln:.4f}*PTS,fps={FPS},{pre}{fit}[{label}{k}]"

def montage(shots, W, H, label):
    parts = [beat(sh, k, W, H, label) for k, sh in enumerate(shots)]
    ins = "".join(f"[{label}{k}]" for k in range(len(shots)))
    parts.append(f"{ins}concat=n={len(shots)}:v=1:a=0,trim=duration={DUR},setpts=PTS-STARTPTS,{GRADE},format=yuv420p[{label}]")
    return ";".join(parts)

def encode(fc, label, name, crf):
    mp4 = f"assets/video/{name}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", f"[{label}]", "-an", "-c:v", "libx264", "-preset", "slow",
                    "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-deadline", "good", "-cpu-used", "2",
                    "-row-mt", "1", "-an", f"assets/video/{name}.webm"], check=True)
    print(name, {e: f"{os.path.getsize(f'assets/video/{name}.{e}') // 1024} KB" for e in ("mp4", "webm")})

assert len(SHOTS) >= N, f"need at least {N} shots, got {len(SHOTS)}"
os.makedirs("assets/video", exist_ok=True)
w, h = probe(SHOTS[0][0])
first9 = SHOTS[:N]
if h > w:   # portrait footage or photos: 3 panels (8 px black gutters) for wide screens, 1 panel for phones
    rot = lambda r: [SHOTS[(i + r) % len(SHOTS)] for i in range(N)]
    off = N if len(SHOTS) >= 3 * N else 3
    fc = ";".join(montage(rot(r * off), 404, 720, l) for r, l in ((0, "p0"), (1, "p1"), (2, "p2")))
    fc += ";[p0]pad=412:720:0:0:black[q0];[p1]pad=412:720:0:0:black[q1];[q0][q1][p2]hstack=3[wide]"
else:       # landscape: one 16:9 montage
    fc = montage(first9, 1280, 720, "wide")
encode(fc, "wide", "intro", 25)
encode(montage(first9, 540, 960, "ph"), "ph", "intro-mobile", 25)
