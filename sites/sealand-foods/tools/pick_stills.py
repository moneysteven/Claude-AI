# usage: python3 tools/pick_stills.py   (run from the site folder)
# Finds the sharpest frame in each window of the walkthrough video and saves it, colour-corrected, to _source/stills/<name>.jpg
import subprocess, os, glob, tempfile
from PIL import Image, ImageFilter, ImageStat
SRC = "_source/walkthrough-graded.mp4"   # colour-corrected master (tools/grade_source.sh)
INTERIOR = "null"
EXTERIOR = "null"
WINDOWS = {  # name: (start, end, grade)
    "exterior-storefront": (4.6, 8.2, EXTERIOR), "exterior-sign": (8.6, 9.8, EXTERIOR),
    "door-poster": (9.8, 10.6, EXTERIOR), "interior-wide": (12.0, 13.6, INTERIOR),
    "fridges": (15.6, 17.4, INTERIOR), "deli-counter": (18.8, 20.8, INTERIOR),
    "store-banner": (23.6, 25.2, INTERIOR), "dessert-case": (26.6, 28.2, INTERIOR),
    "deli-case": (28.4, 29.4, INTERIOR), "fresh-rolls": (31.4, 33.6, INTERIOR), "dessert-menu": (12.4, 13.3, INTERIOR),
}
os.makedirs("_source/stills", exist_ok=True)
for name, (a, b, grade) in WINDOWS.items():
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-ss", str(a), "-t", str(b - a), "-i", SRC, "-vf", "fps=10,scale=360:-2", f"{d}/%03d.png"], check=True)
        best = max(sorted(glob.glob(f"{d}/*.png")), key=lambda f: ImageStat.Stat(Image.open(f).convert("L").filter(ImageFilter.FIND_EDGES)).var[0])
        t = a + (int(os.path.basename(best)[:3]) - 1) / 10
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", SRC, "-frames:v", "1", "-vf", grade, "-q:v", "2", f"_source/stills/{name}.jpg"], check=True)
    print(f"{name}: t={t:.1f}s")
