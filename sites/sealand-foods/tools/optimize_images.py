# usage: python3 tools/optimize_images.py <files or dirs...> <out_dir>   (prints a JSON manifest)
import json, os, sys
from PIL import Image, ImageOps
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
    for w in (480, 960, 1600):
        if w > im.width and w != 480:
            continue
        r = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        p = os.path.join(out, f"{name}-{w}.webp"); r.save(p, "WEBP", quality=80, method=6); e["files"][f"webp{w}"] = p
    big = im if im.width <= 1600 else im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    p = os.path.join(out, f"{name}.png" if alpha else f"{name}.jpg")
    big.save(p, optimize=True) if alpha else big.save(p, "JPEG", quality=82, optimize=True, progressive=True)
    e["files"]["fallback"] = p
    man.append(e)
print(json.dumps(man, indent=1))
