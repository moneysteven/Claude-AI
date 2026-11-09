# Background and phone bezel for the phone section (screen area left transparent).
# usage: python3 phone_frame.py [#brandhex]   -> phone_bg.png + phone_frame.png next to this script
import os, sys
from PIL import Image, ImageDraw, ImageFilter
D = os.path.dirname(os.path.abspath(__file__))
hx = (sys.argv[1] if len(sys.argv) > 1 else '#A3CF3E').lstrip('#')
GLOW = tuple(int(int(hx[i:i + 2], 16) * 0.25) for i in (0, 2, 4))     # the brand colour, dimmed
W, H = 1920, 1080
SX, SY, SW, SH = 752, 90, 416, 900         # where the phone screen sits
bg = Image.new('RGB', (W, H), (8, 8, 9))
glow = Image.new('L', (W, H), 0); ImageDraw.Draw(glow).ellipse([W * .25, H * .05, W * .75, H * .95], fill=80)
bg = Image.composite(Image.new('RGB', (W, H), GLOW), bg, glow.filter(ImageFilter.GaussianBlur(200)))
bg.save(f'{D}/phone_bg.png')
S = 2   # draw the bezel at 2x for smooth corners
fr = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(fr)
b = 18
d.rounded_rectangle([(SX - b) * S, (SY - b) * S, (SX + SW + b) * S, (SY + SH + b) * S], radius=62 * S, fill=(24, 24, 27, 255), outline=(70, 72, 76, 255), width=3 * S)
hole = Image.new('L', fr.size, 0); ImageDraw.Draw(hole).rounded_rectangle([SX * S, SY * S, (SX + SW) * S, (SY + SH) * S], radius=46 * S, fill=255)
fr.putalpha(Image.composite(Image.new('L', fr.size, 0), fr.getchannel('A'), hole))
d = ImageDraw.Draw(fr)
d.rounded_rectangle([(SX + SW / 2 - 52) * S, (SY + 10) * S, (SX + SW / 2 + 52) * S, (SY + 40) * S], radius=15 * S, fill=(0, 0, 0, 255))   # camera island
fr.resize((W, H), Image.LANCZOS).save(f'{D}/phone_frame.png')
print('phone_bg.png + phone_frame.png')
