# usage: python3 tools/crop_stills.py   (run from the site folder, after tools/pick_stills.py)
# Cuts the 2160x3840 stills into web-friendly shapes in _source/crops/, then run:
#   python3 tools/optimize_images.py _source/crops assets/img
import os, subprocess
from PIL import Image
from PIL import ImageFilter, ImageEnhance, ImageDraw
os.makedirs("_source/crops", exist_ok=True)
S = "_source/stills"

def balance(im):
    """gentle white balance: make bright, low-saturation pixels neutral (each channel gain capped at +/-8%)"""
    sm = im.convert("RGB").resize((160, 284))
    px = [p for p in sm.getdata() if sum(p) / 3 > 140 and max(p) - min(p) < 60]
    if len(px) < 200:
        return im
    avg = [sum(p[i] for p in px) / len(px) for i in range(3)]; g = sum(avg) / 3
    gains = [min(1.08, max(0.92, g / a)) for a in avg]
    return Image.merge("RGB", [ch.point(lambda v, k=k: min(255, round(v * k))) for ch, k in zip(im.convert("RGB").split(), gains)])

_open = Image.open
def open_still(path):
    return balance(_open(path))
# 4:5 crops (2160x2700 window starting at y), saved at 1200x1500
FOUR_FIVE = {"exterior-storefront": 350, "exterior-sign": 0, "door-poster": 150, "interior-wide": 600, "fridges": 500,
             "deli-counter": 300, "store-banner": 600, "dessert-case": 450, "deli-case": 500, "fresh-rolls": 250}
for name, y in FOUR_FIVE.items():
    open_still(f"{S}/{name}.jpg").crop((0, y, 2160, y + 2700)).resize((1200, 1500), Image.LANCZOS).save(f"_source/crops/{name}.jpg", quality=92)
# 9:16 tall versions for the gallery, 1080x1920
for name in ("exterior-storefront", "interior-wide", "store-banner"):
    open_still(f"{S}/{name}.jpg").resize((1080, 1920), Image.LANCZOS).save(f"_source/crops/{name}-tall.jpg", quality=92)
# the TV dessert menu at 12.7 s, 16:9
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "12.7", "-i", "_source/walkthrough-graded.mp4", "-frames:v", "1", "-q:v", "1",
                "-vf", "crop=1020:574:700:0,scale=1200:-2:flags=lanczos", "_source/crops/dessert-menu.jpg"], check=True)
# the dessert menu as a 4:5 card: the whole screen over a blurred copy of itself
tv = balance(_open("_source/crops/dessert-menu.jpg")); tv.save("_source/crops/dessert-menu.jpg", quality=92)
bg = tv.resize((round(tv.width * 1500 / tv.height), 1500), Image.LANCZOS)
bg = bg.crop(((bg.width - 1200) // 2, 0, (bg.width - 1200) // 2 + 1200, 1500)).filter(ImageFilter.GaussianBlur(40))
bg = ImageEnhance.Brightness(bg).enhance(0.45)
fg = tv.resize((1120, round(tv.height * 1120 / tv.width)), Image.LANCZOS)
mask = Image.new("L", fg.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, fg.width - 1, fg.height - 1), radius=28, fill=255)
bg.paste(fg, (40, 360), mask); bg.save("_source/crops/dessert-menu-card.jpg", quality=92)
print(sorted(os.listdir("_source/crops")))
