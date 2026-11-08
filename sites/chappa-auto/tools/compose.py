# usage: python3 tools/compose.py   (run from the site folder; needs Pillow)
# Makes everything the pipeline needs from the client's own images in _source/photos:
#   _source/composed/cut/*.png      product cut-outs (white backgrounds removed, alpha kept)
#   _source/composed/*.jpg          brand-colour product frames for the intro, page heroes and spotlight
#   _source/composed/store-*.jpg    16:9 crops of the Molynes Road storefront photo
# No stock imagery: every frame is a supplied product image or the storefront photo on a brand-colour gradient.
import os
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageChops

P = "_source/photos"; OUT = "_source/composed"; CUT = f"{OUT}/cut"
os.makedirs(CUT, exist_ok=True)

def load(name):
    return ImageOps.exif_transpose(Image.open(os.path.join(P, name))).convert("RGBA")

def knock_out_white(im, tol=26, feather=1.2):
    """flood-fill near-white from every border pixel -> transparent (keeps white inside the product)"""
    rgb = im.convert("RGB"); w, h = rgb.size
    mask = Image.new("L", (w, h), 0)
    seed_img = rgb.copy()
    marker = (255, 0, 255)
    for x in range(0, w, 3):
        for y in (0, h - 1):
            if min(seed_img.getpixel((x, y))) > 255 - tol and seed_img.getpixel((x, y)) != marker:
                ImageDraw.floodfill(seed_img, (x, y), marker, thresh=tol)
    for y in range(0, h, 3):
        for x in (0, w - 1):
            if min(seed_img.getpixel((x, y))) > 255 - tol and seed_img.getpixel((x, y)) != marker:
                ImageDraw.floodfill(seed_img, (x, y), marker, thresh=tol)
    px, mp = seed_img.load(), mask.load()
    for y in range(h):
        for x in range(w):
            mp[x, y] = 0 if px[x, y] == marker else 255
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(feather))
    a = ImageChops.multiply(im.getchannel("A"), mask)
    out = im.copy(); out.putalpha(a)
    return out.crop(out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())

def trim(im):
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())

# 1. cut-outs -------------------------------------------------------------
cuts = {
    "bmk-brake-pad":   knock_out_white(load("BMK-BRAKE-PAD.png")),
    "aoteli-tyre":     knock_out_white(load("AOTELI-1.png")),
    "ilink-tyre-angle": knock_out_white(load("ILINK-TYRE-1-1.png")),
    "ilink-tyre":      trim(load("ILINK-TYRE-1.png")),
    "aoteli-tread":    trim(load("AOTELI-2-1.png")),
    "helix-hx5-1l":    trim(load("Helix_HX5_SN_10W30_1L.png")),
    "helix-hx5-4l":    trim(load("Helix_HX5_SN_20W50_4L-removebg-e1760406947752.png")),
    "helix-hx7-4l":    trim(load("Shell-Helix_HX7_10W30_4L.png")),
    "rimula-r4x":      trim(load("550045436_Rimula_R4-X_15W40_4L_LATAM.png")),
    "omala-s2g":       trim(load("Omala-S2-G-Y.png")),
}
for k, im in cuts.items():
    im.save(f"{CUT}/{k}.png"); print("cut", k, im.size)

# 2. backgrounds ------------------------------------------------------------
BG = {  # (centre, edge) in the site's brand colours
    "navy":   ((26, 44, 170), (2, 6, 34)),
    "red":    ((214, 46, 38), (58, 6, 6)),
    "yellow": ((252, 210, 26), (150, 104, 0)),
    "ink":    ((40, 44, 60), (6, 7, 12)),
}
def backdrop(W, H, kind, cx=.5, cy=.45, streak=True):
    c0, c1 = BG[kind]
    small = Image.new("RGB", (W // 8, H // 8)); d = small.load()
    sw, sh = small.size; r = (sw ** 2 + sh ** 2) ** .5 * .62
    for y in range(sh):
        for x in range(sw):
            t = min(1, ((x - sw * cx) ** 2 + (y - sh * cy) ** 2) ** .5 / r) ** 1.35
            d[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    bg = small.resize((W, H), Image.BICUBIC).convert("RGBA")
    if streak:  # soft diagonal light band, like a studio sweep
        band = Image.new("L", (W, H), 0); bd = ImageDraw.Draw(band)
        bd.polygon([(W * .55, 0), (W * .75, 0), (W * .35, H), (W * .15, H)], fill=38)
        band = band.filter(ImageFilter.GaussianBlur(W / 18))
        bg = Image.composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), bg, band)
    return bg

def place(bg, im, cx, base_y, height, shadow=True, reflect=False):
    """paste product so its bottom sits on base_y, centred on cx, scaled to `height` px"""
    s = height / im.height; im = im.resize((max(1, round(im.width * s)), round(height)), Image.LANCZOS)
    base_y = round(base_y); x, y = round(cx - im.width / 2), base_y - im.height
    if shadow:
        sh = Image.new("L", bg.size, 0); sd = ImageDraw.Draw(sh)
        sd.ellipse([x + im.width * .08, base_y - im.width * .05, x + im.width * .92, base_y + im.width * .07], fill=170)
        sh = sh.filter(ImageFilter.GaussianBlur(max(6, im.width / 14)))
        black = Image.new("RGBA", bg.size, (0, 0, 0, 255)); black.putalpha(sh)
        bg.alpha_composite(black)
    if reflect:
        rf = ImageOps.flip(im).copy(); a = rf.getchannel("A")
        grad = Image.linear_gradient("L").resize(rf.size).point(lambda v: max(0, 70 - v))
        rf.putalpha(ImageChops.multiply(a, grad))
        room = bg.height - (base_y + 2)
        if room > 0: bg.alpha_composite(rf.crop((0, 0, rf.width, min(rf.height, room))), (x, base_y + 2))
    bg.alpha_composite(im, (x, y))
    return bg

def save(im, name, q=90):
    im.convert("RGB").save(f"{OUT}/{name}.jpg", quality=q, subsampling=0); print("frame", name, im.size)

W, H = 1920, 1080
# 3. intro beats: one product per frame, centred so the 9:16 phone crop keeps it --------------
for name, kind, prod, hgt in [
    ("beat-bmk-pad", "navy", "bmk-brake-pad", 340), ("beat-ilink", "red", "ilink-tyre", 820),
    ("beat-helix-1l", "navy", "helix-hx5-1l", 760), ("beat-aoteli", "yellow", "aoteli-tyre", 700),
    ("beat-rimula", "red", "rimula-r4x", 760), ("beat-omala", "navy", "omala-s2g", 720),
    ("beat-hx7", "ink", "helix-hx7-4l", 780),
]:
    im = cuts[prod]; h = min(hgt, 540 * im.height / im.width)  # keep width <= 540 for the phone crop
    save(place(backdrop(W, H, kind), im, W / 2, H * .9, h, reflect=not prod.startswith("bmk")), name)

# the line-up: the whole counter in one frame (strongest beat, also the spotlight/"all departments" image)
def lineup(W, H, kind="navy", scale=1.0):
    bg = backdrop(W, H, kind, cy=.5)
    glow = Image.new("L", (W, H), 0); ImageDraw.Draw(glow).ellipse([W * .25, H * .2, W * .75, H * .95], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(W / 10)); red = Image.new("RGBA", (W, H), (204, 39, 33, 255)); red.putalpha(glow)
    bg.alpha_composite(red)
    base = H * .9
    place(bg, cuts["ilink-tyre"], W * .30, base, H * .78 * scale)
    place(bg, cuts["bmk-brake-pad"], W * .69, base, H * .36 * scale)
    place(bg, cuts["helix-hx5-4l"], W * .5, base + H * .02, H * .74 * scale, reflect=True)
    return bg
save(lineup(W, H), "beat-lineup")

# 4. storefront crops (the client's real photo) ---------------------------------------
store = load("IMG-20250807-WA0012-e1759838818351.jpg").convert("RGB")
def crop169(img, cx, cy, w):
    h = w * 9 / 16; return img.crop((round(cx - w / 2), round(cy - h / 2), round(cx + w / 2), round(cy + h / 2)))
crop169(store, 760, 620, 1000).save(f"{OUT}/store-entrance.jpg", quality=92)   # main CA sign + door
crop169(store, 470, 400, 760).save(f"{OUT}/store-signs.jpg", quality=92)       # Shell Lubricants + upper CA sign
crop169(store, 800, 455, 1600).save(f"{OUT}/store-facade-top.jpg", quality=92) # sky + both signs (promo band)
crop169(store, 1345, 815, 500).save(f"{OUT}/store-wall.jpg", quality=92)       # painted CHAPPA AUTO wall lettering
print("store crops done")

# 5. page heroes: product on the right, room for text on the left -----------------------
def hero(name, kind, items):
    bg = backdrop(W, H, kind, cx=.68, cy=.5)
    for prod, cx, h, refl in items: place(bg, cuts[prod], W * cx, H * .9, H * h, reflect=refl)
    shade = Image.linear_gradient("L").rotate(90).resize((W, H))  # darken the text side
    shade = shade.point(lambda v: round(v * .55)); blk = Image.new("RGBA", (W, H), (0, 0, 0, 255)); blk.putalpha(shade)
    bg.alpha_composite(blk); save(bg, name)
hero("hero-parts", "red",  [("bmk-brake-pad", .72, .46, False)])
hero("hero-tyres", "ink",  [("aoteli-tyre", .62, .6, False), ("ilink-tyre", .82, .8, False)])
hero("hero-shell", "navy", [("rimula-r4x", .58, .5, True), ("helix-hx5-4l", .74, .72, True), ("helix-hx7-4l", .89, .56, True)])
hero("hero-wholesale", "ink", [("omala-s2g", .6, .52, True), ("helix-hx5-4l", .75, .7, True), ("ilink-tyre", .9, .74, False)])

# 6. spotlight frames (4:3) ----------------------------------------------------------
SW, SH = 1200, 900
def spot(name, kind, items):
    bg = backdrop(SW, SH, kind, cy=.5)
    for prod, cx, h, refl in items: place(bg, cuts[prod], SW * cx, SH * .88, SH * h, reflect=refl)
    save(bg, name)
spot("spot-brakes", "red",   [("bmk-brake-pad", .5, .5, False)])
spot("spot-tyres",  "ink",   [("aoteli-tyre", .36, .62, False), ("ilink-tyre", .66, .78, False)])
spot("spot-oils",   "navy",  [("helix-hx5-1l", .2, .5, True), ("rimula-r4x", .38, .58, True), ("helix-hx5-4l", .6, .74, True), ("omala-s2g", .83, .52, True)])

# 7. welcome trio (transparent) -------------------------------------------------------
TW, TH = 1200, 1000
trio = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
place(trio, cuts["ilink-tyre"], TW * .32, TH * .96, TH * .86, shadow=False)
place(trio, cuts["bmk-brake-pad"], TW * .74, TH * .97, TH * .38, shadow=False)
place(trio, cuts["helix-hx5-4l"], TW * .55, TH * .99, TH * .8, shadow=False)
trio.save(f"{OUT}/welcome-trio.png"); print("trio done")
