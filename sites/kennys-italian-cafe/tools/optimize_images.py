# usage: python3 tools/optimize_images.py <files or dirs...> <out_dir>   (prints a JSON manifest)
import json, os, sys
from PIL import Image, ImageOps
BUDGET = 250 * 1024          # each image file stays under 250 KB: lower the quality step by step if needed
def save(img, p, fmt, q):
    while True:
        img.save(p, fmt, quality=q, optimize=True, **({"method": 6} if fmt == "WEBP" else {"progressive": True}))
        if os.path.getsize(p) <= BUDGET or q <= 50: return
        q -= 6
*srcs, out = sys.argv[1:]
os.makedirs(out, exist_ok=True)
files = []
for s in srcs:
    files += [os.path.join(s, f) for f in sorted(os.listdir(s))] if os.path.isdir(s) else [s]
man = []
for f in files:
    if not f.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")):
        continue
    try:
        im = Image.open(f)
    except Exception as e:
        print(f"SKIP {f}: {e}", file=sys.stderr); continue
    im = ImageOps.exif_transpose(im)
    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    name = os.path.splitext(os.path.basename(f))[0].lower().replace(" ", "-")
    e = {"src": f, "name": name, "w": im.width, "h": im.height, "alpha": alpha, "files": {}}
    # widths 480/960/1600, but never more than 1600 px on the LONGEST side (tall photos stay light)
    cap = min(1.0, 1600 / max(im.width, im.height))
    for w in (480, 960, 1600):
        if w > im.width * cap and w != 480:
            continue
        w = min(w, round(im.width * cap))
        r = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        key = 480 if w <= 480 else 960 if w <= 960 else 1600
        p = os.path.join(out, f"{name}-{key}.webp"); save(r, p, "WEBP", 74); e["files"][f"webp{key}"] = p; e[f"w{key}"] = r.width
    fb = min(1.0, 1280 / max(im.width, im.height))
    big = im if fb == 1 else im.resize((round(im.width * fb), round(im.height * fb)), Image.LANCZOS)
    p = os.path.join(out, f"{name}.png" if alpha else f"{name}.jpg")
    big.save(p, optimize=True) if alpha else save(big, p, "JPEG", 78)
    e["files"]["fallback"] = p
    man.append(e)
print(json.dumps(man, indent=1))
