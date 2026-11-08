# usage: python3 tools/clean_overlays.py   (run from the site folder)
# Removes social-media overlays from the supplied photos and writes clean copies to _source/clean/.
# Originals in _source/ are never changed.
#   negril-stand-night    Instagram mute icon (bottom right)        -> crop the bottom strip
#   paleta-creamy         Baileys "#AD" mark + fine print           -> crop the bottom strip
#   paleta-sprinkles-dip  Instagram mute icon (bottom right)        -> crop the right strip
#                         "Chill Pops Ja" location tag (top left)   -> rebuilt from the blurred background around it
#   guest-yellow-paleta   "1/2" counter + mute icon (right side)    -> crop the right strip
#   detail-stick-hashtag  screen-recording black edge + round corner -> trim the edges
#   paleta-coconut-dip    screen-recording round corners             -> trim the edges
import os
from PIL import Image, ImageFilter

SRC, OUT = "_source", "_source/clean"
os.makedirs(OUT, exist_ok=True)

def fill_from_surroundings(im, box, pad=18):
    """Fill a box by blending the rows above and below it, then blur. Works on soft, out-of-focus backgrounds."""
    x0, y0, x1, y1 = box
    top = im.crop((x0, y0 - pad, x1, y0))
    bot = im.crop((x0, y1, x1, y1 + pad))
    h = y1 - y0
    patch = Image.new("RGB", (x1 - x0, h))
    t = top.resize((x1 - x0, 1), Image.BOX)
    b = bot.resize((x1 - x0, 1), Image.BOX)
    for y in range(h):
        patch.paste(Image.blend(t, b, y / max(1, h - 1)), (0, y))
    big = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    region = im.crop(big)
    region.paste(patch, (pad, pad))
    region = region.filter(ImageFilter.GaussianBlur(9))
    mask = Image.new("L", region.size, 0)
    mask.paste(255, (pad // 2, pad // 2, region.width - pad // 2, region.height - pad // 2))
    mask = mask.filter(ImageFilter.GaussianBlur(pad / 3))
    im.paste(region, big[:2], mask)
    return im

jobs = {
    "negril-stand-night.jpg":   lambda im: im.crop((0, 0, im.width, 1330)),
    "paleta-creamy.jpg":        lambda im: im.crop((0, 0, im.width, 1282)),
    "paleta-sprinkles-dip.jpg": lambda im: fill_from_surroundings(im, (26, 254, 186, 302)).crop((0, 0, 992, im.height)),
    "guest-yellow-paleta.jpg":  lambda im: im.crop((0, 0, 968, im.height)),
    "detail-stick-hashtag.jpg": lambda im: im.crop((0, 24, 872, im.height - 24)),
    "paleta-coconut-dip.jpg":   lambda im: im.crop((14, 14, im.width - 14, im.height - 18)),
}
for f in sorted(os.listdir(SRC)):
    if not f.lower().endswith(".jpg"):
        continue
    im = Image.open(os.path.join(SRC, f)).convert("RGB")
    if f in jobs:
        im = jobs[f](im)
    im.save(os.path.join(OUT, f), "JPEG", quality=94)
    print(f, im.size, "cleaned" if f in jobs else "copied")
