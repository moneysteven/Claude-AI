# usage: python3 tools/shrink_fallbacks.py assets/img   (keeps every JPG/PNG fallback under ~250 KB)
import os, sys
from PIL import Image
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    p = os.path.join(d, f); size = os.path.getsize(p) if os.path.isfile(p) else 0
    if size <= 250_000: continue
    im = Image.open(p)
    if f.endswith(".png"):   # alpha PNG: 256-colour palette with alpha
        im.convert("RGBA").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(p, optimize=True)
    elif f.endswith(".jpg"):
        for q in (78, 72, 66):
            im.convert("RGB").save(p, "JPEG", quality=q, optimize=True, progressive=True)
            if os.path.getsize(p) <= 250_000: break
    print(f, size // 1024, "KB ->", os.path.getsize(p) // 1024, "KB")
