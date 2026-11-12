#!/usr/bin/env python3
"""Build the single-file Glow by Launthin site.

Inlines every photo and reel clip in ./assets as a base64 data URI so the
whole site ships as one HTML file (three.js still loads from cdnjs).

  python3 build.py                      -> index.html (standalone page with doctype)
  python3 build.py --fragment out.html  -> body-only version for hosts that add
                                           their own <html>/<head> wrapper
"""
import base64
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
TYPES = {".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4"}


def build() -> str:
    media = {}
    for f in sorted((HERE / "assets").iterdir()):
        mime = TYPES.get(f.suffix.lower())
        if mime:
            media[f.stem] = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode("ascii")
    page = (HERE / "src" / "page.html").read_text(encoding="utf-8")
    marker = "/*MEDIA*/{}"
    if marker not in page:
        sys.exit("media marker not found in src/page.html")
    return page.replace(marker, json.dumps(media, separators=(",", ":")))


def main() -> None:
    html = build()
    if len(sys.argv) == 3 and sys.argv[1] == "--fragment":
        out = pathlib.Path(sys.argv[2])
        out.write_text(html, encoding="utf-8")
    else:
        out = HERE / "index.html"
        head = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
        out.write_text(head + html + "\n</html>\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
