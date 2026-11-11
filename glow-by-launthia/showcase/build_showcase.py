"""Build the showcase films: embeds the built website (../index.html) into each film page.

    python3 showcase/build_showcase.py                    # writes showcase/glow-showcase.html and glow-showcase-laptop.html
    python3 showcase/build_showcase.py --fragments DIR    # also writes copies without the document wrapper (artifact publish)

Run `python3 build.py` first so index.html is current.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
FILMS = [("showcase.html", "glow-showcase.html"), ("showcase-laptop.html", "glow-showcase-laptop.html")]

site = (ROOT / "index.html").read_text(encoding="utf-8")
assert '<meta charset="utf-8">' in site, "site must start with a charset meta"
# a JS string literal; "</" is escaped so the embedded page can never close the film's script tag
literal = json.dumps(site, ensure_ascii=False).replace("</", "<\\/")
head = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
frag_dir = pathlib.Path(sys.argv[sys.argv.index("--fragments") + 1]) if "--fragments" in sys.argv else None

for src, name in FILMS:
    template = (HERE / "src" / src).read_text(encoding="utf-8")
    marker = '/*SITE*/""'
    assert template.count(marker) == 1, f"SITE marker missing in {src}"
    body = template.replace(marker, literal)
    out = HERE / name
    out.write_text(head + body, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")
    if frag_dir:
        frag = frag_dir / name
        frag.write_text(body, encoding="utf-8")
        print(f"wrote {frag} ({frag.stat().st_size / 1e6:.2f} MB)")
