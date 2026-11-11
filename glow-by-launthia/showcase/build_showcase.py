"""Build the showcase film: embeds the built website (../index.html) into the film page.

    python3 showcase/build_showcase.py                # writes showcase/glow-showcase.html (full document)
    python3 showcase/build_showcase.py --fragment X   # also writes X without the document wrapper (artifact publish)

Run `python3 build.py` first so index.html is current.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
template = (HERE / "src" / "showcase.html").read_text(encoding="utf-8")
site = (ROOT / "index.html").read_text(encoding="utf-8")

marker = '/*SITE*/""'
assert template.count(marker) == 1, "SITE marker missing"
assert '<meta charset="utf-8">' in site, "site must start with a charset meta"
# a JS string literal; "</" is escaped so the embedded page can never close this script tag
literal = json.dumps(site, ensure_ascii=False).replace("</", "<\\/")
body = template.replace(marker, literal)

head = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
out = HERE / "glow-showcase.html"
out.write_text(head + body, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")

if "--fragment" in sys.argv:
    frag = pathlib.Path(sys.argv[sys.argv.index("--fragment") + 1])
    frag.write_text(body, encoding="utf-8")
    print(f"wrote {frag} ({frag.stat().st_size / 1e6:.2f} MB)")
