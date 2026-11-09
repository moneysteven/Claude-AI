# usage: python3 -I tools/logo_cutout.py <logo-on-white.jpg> <out.png> [debug.png]
# Turns the supplied logo (white script lettering + grey shadow on a white background) into a transparent PNG
# that works on dark backgrounds: background removed, lettering kept white, shadow kept as a soft black shadow,
# palm and cup colours un-blended from the white so their edges stay clean.
import sys
from collections import deque
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
H, W, _ = im.shape
mn, mx = im.min(2), im.max(2)
sat = mx - mn
L = (0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2])
passable = (mn >= 236) & (sat < 20)            # near-white pixels (background, and the letter interiors)

def flood(mask, seeds):
    seen = np.zeros_like(mask, bool); q = deque()
    for y, x in seeds:
        if mask[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    return seen

border = [(0, x) for x in range(W)] + [(H-1, x) for x in range(W)] + [(y, 0) for y in range(H)] + [(y, W-1) for y in range(H)]
bg = flood(passable, border)                    # white reachable from the edge = background
enclosed = passable & ~bg                       # white walled in by the shadow ring = lettering (or a letter's counter)

# label the enclosed islands; tiny ones are counters / noise and are treated as shadow, not lettering
labels = np.zeros((H, W), np.int32); sizes = {}; n = 0
ys, xs = np.nonzero(enclosed)
for y, x in zip(ys, xs):
    if labels[y, x]: continue
    n += 1; q = deque([(y, x)]); labels[y, x] = n; c = 0
    while q:
        cy, cx = q.popleft(); c += 1
        for ny, nx in ((cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)):
            if 0 <= ny < H and 0 <= nx < W and enclosed[ny, nx] and not labels[ny, nx]:
                labels[ny, nx] = n; q.append((ny, nx))
    sizes[n] = c
MIN = int(sys.argv[4]) if len(sys.argv) > 4 else 400
# where is each island? (centroid + box) so pockets of background inside the palm/cup icon can be dropped
info = {}
for i in range(1, n + 1):
    yy, xx = np.nonzero(labels == i) if sizes[i] >= MIN else (np.array([0]), np.array([0]))
    info[i] = (int(xx.mean()), int(yy.mean()), int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max()))
    if sizes[i] >= MIN: print(f"island {i}: size {sizes[i]} centroid {info[i][:2]} box {info[i][2:]}", file=sys.stderr)
ICON_X = int(sys.argv[5]) if len(sys.argv) > 5 else 10**9      # islands right of this x are inside the icon...
BAND = [int(v) for v in sys.argv[6].split(",")] if len(sys.argv) > 6 else []   # ...except these island ids (the cup's white band)
keep = np.array([0] + [1 if sizes[i] >= MIN and (info[i][0] < ICON_X or i in BAND) else 0 for i in range(1, n + 1)], bool)
text = keep[labels]
print("islands:", sorted(sizes.values(), reverse=True)[:40], "kept", int(keep.sum()), file=sys.stderr)

rgba = np.zeros((H, W, 4), np.float32)
# shadow: black with alpha from darkness
a_sh = np.clip((255 - L) / 255 * 1.15, 0, 1)
rgba[..., 3] = a_sh
# colours (palm green, cup red): un-blend from white
col = (sat >= 35) & ~text
a_c = np.clip((255 - mn) / 205, 0, 1)
safe = np.maximum(a_c, 1e-3)[..., None]
unb = np.clip((im - (1 - a_c)[..., None] * 255) / safe, 0, 255)
rgba[col, :3] = unb[col]; rgba[col, 3] = np.maximum(a_c[col], a_sh[col])
# lettering: solid white
rgba[text] = (255, 255, 255, 1)
rgba[bg] = (0, 0, 0, 0)
rgba[..., 3] *= 255
img = Image.fromarray(rgba.round().astype(np.uint8), "RGBA")
bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
img = img.crop((max(0, bbox[0]-6), max(0, bbox[1]-6), min(W, bbox[2]+6), min(H, bbox[3]+6)))
img.save(out, optimize=True)
if len(sys.argv) > 3 and sys.argv[3] != "-":
    prev = Image.new("RGBA", img.size, (18, 16, 14, 255)); prev.alpha_composite(img); prev.convert("RGB").save(sys.argv[3])
print(out, img.size, file=sys.stderr)
