# usage: python3 tools/sync_partials.py   (run from the site folder)
# Copies partials/head.html, partials/header.html and partials/footer.html into every page, between the
# <!-- @head --> ... <!-- /@head --> (and @header / @footer) markers, and marks the current page's nav link
# with aria-current="page". Everything outside the markers (each page's own content) is never touched.
import glob, re

parts = {n: open(f"partials/{n}.html", encoding="utf-8").read().strip() for n in ("head", "header", "footer")}
for f in sorted(glob.glob("*.html")):
    s = open(f, encoding="utf-8").read()
    for n, body in parts.items():
        if n == "header":
            body = body.replace(f'<a href="{f}">', f'<a href="{f}" aria-current="page">')
        s, k = re.subn(rf"(<!-- @{n}\b[^>]*-->\n).*?(\n<!-- /@{n} -->)", lambda m: m.group(1) + body + m.group(2), s, flags=re.S)
        if not k:
            print(f"{f}: no @{n} markers, skipped")
    open(f, "w", encoding="utf-8").write(s)
    print("synced", f)
