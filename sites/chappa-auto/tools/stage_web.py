# usage: python3 tools/stage_web.py   (run from the site folder, after tools/compose.py)
# Copies the images the site uses into _source/web/ with role-based names (and sensible max sizes),
# then: python3 tools/optimize_images.py _source/web assets/img > content/image-manifest.json
import os, shutil
from PIL import Image, ImageOps
P, C, W = "_source/photos", "_source/composed", "_source/web"
shutil.rmtree(W, ignore_errors=True); os.makedirs(W)

def put(src, name, max_h=None, max_w=None):
    im = ImageOps.exif_transpose(Image.open(src)); im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    if max_h and im.height > max_h: im = im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)
    if max_w and im.width > max_w: im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    ext = ".png" if im.mode == "RGBA" else ".jpg"
    im.save(os.path.join(W, name + ext), **({"quality": 95} if ext == ".jpg" else {}))

# exterior (the only real business photo) and its crops
put(f"{P}/IMG-20250807-WA0012-e1759838818351.jpg", "store-molynes-road")
for n in ("store-entrance", "store-facade-top", "store-signs", "store-wall"): put(f"{C}/{n}.jpg", n)
# product cut-outs (alpha)
for n in ("bmk-brake-pad", "aoteli-tyre", "ilink-tyre", "ilink-tyre-angle", "aoteli-tread", "helix-hx5-1l", "helix-hx5-4l",
          "helix-hx7-4l", "rimula-r4x", "omala-s2g"):
    put(f"{C}/cut/{n}.png", "product-" + n, max_h=900)
# product cards supplied as artwork
def flat(src, name, max_h=None):  # supplied artwork with a white card: flatten onto white, save as JPG
    im = Image.open(src).convert("RGBA"); bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    im = bg.convert("RGB")
    if max_h and im.height > max_h: im = im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)
    im.save(os.path.join(W, name + ".jpg"), quality=95)
flat(f"{P}/BMK-BRAKE-SHOE_.png", "product-bmk-brake-shoe-flyer", max_h=1200)
flat(f"{P}/Layer-155.png", "product-bmk-brake-shoe-lk04804")
# composed brand-colour frames
for n in ("hero-parts", "hero-tyres", "hero-shell", "hero-wholesale"): put(f"{C}/{n}.jpg", n, max_w=1600)
for n in ("spot-brakes", "spot-tyres", "spot-oils"): put(f"{C}/{n}.jpg", n, max_w=1200)
put(f"{C}/welcome-trio.png", "welcome-trio", max_w=1100)
# brand marks (kept in their own colours)
put(f"{C}/ca-mark.png", "logo-ca-mark")
put(f"{P}/BMK-LOGO.png", "brand-bmk", max_w=600)
put(f"{P}/POWER-KING-LOGO.png", "brand-power-king", max_w=600)
put(f"{P}/2025-05-Shell-Lubricants-Distributor-Descriptor.png", "brand-shell-distributor", max_w=900)

# vehicle-make marks -> white line art for the dark "parts for popular makes" strip (dark ink becomes white, white fills become clear)
MAKES = {"toyota": "Layer-153.png", "honda": "Layer-152.png", "isuzu": "Layer-151.png", "nissan": "nissan-logo-png_seeklogo-263766.png",
         "mitsubishi": "1693317037mitsubishi-logo-png-black-e1759842436201.png", "subaru": "CITYPNG.COMSubaru-Black-Logo-PNG-2000x2000-1.png",
         "daihatsu": "Daihatsu-mira-Logo-Vector.svg-.png", "suzuki": "NicePng_mr-and-mrs-png_2914134.png", "hyundai": "NicePng_hyundai-logo-png_718107.png",
         "kia": "NicePng_kia-logo-png_1858709.png", "mazda": "NicePng_mazda-png_3404542-e1759842416334.png"}
os.makedirs("assets/img/makes", exist_ok=True)
for make, f in MAKES.items():
    im = Image.open(f"{P}/{f}").convert("RGBA"); a = im.getchannel("A"); lum = im.convert("L")
    alpha = Image.eval(Image.merge("LA", (lum, a)).getchannel(0), lambda v: max(0, min(255, round((255 - v) * 1.6))))
    from PIL import ImageChops
    alpha = ImageChops.multiply(alpha, a)
    out = Image.new("RGBA", im.size, (255, 255, 255, 0)); out.putalpha(alpha)
    out = out.crop(alpha.point(lambda v: 255 if v > 12 else 0).getbbox())
    out.thumbnail((360, 120), Image.LANCZOS)
    out.save(f"assets/img/makes/{make}.png", optimize=True)
    out.save(f"assets/img/makes/{make}.webp", "WEBP", quality=85, method=6)
    print(make, out.size)

# favicons / social image
ico = Image.open(f"{P}/CHAPPA-AUTO-SITE-ICON.png").convert("RGBA")
ico.resize((180, 180), Image.LANCZOS).save("assets/img/apple-touch-icon.png", optimize=True)
ico.resize((48, 48), Image.LANCZOS).save("assets/img/favicon-48.png", optimize=True)
ico.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
poster = Image.open("assets/img/hero-poster.jpg").convert("RGB")
w, h = poster.size; ch = round(w * 630 / 1200)
poster.crop((0, (h - ch) // 2, w, (h - ch) // 2 + ch)).resize((1200, 630), Image.LANCZOS).save("assets/img/og-image.jpg", quality=84, optimize=True, progressive=True)
print("staged", len(os.listdir(W)))
