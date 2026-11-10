#!/usr/bin/env bash
# Builds the single-file artifact: rentyaad/rentyaad.html
# The published artifact gets its <!doctype>/<html>/<head>/<body> skeleton added at publish time,
# so the output starts with <title>/<style>. rentyaad/index.html is a standalone copy with a doctype.
set -euo pipefail
cd "$(dirname "$0")"
OUT=rentyaad.html
{
  cat src/head.html
  echo "<style>"
  cat src/styles.css
  echo "</style>"
  cat src/body.html
  echo "<script>"
  for f in src/js/*.js; do cat "$f"; echo; done
  echo "</script>"
} > "$OUT"
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'
  cat "$OUT"
  echo '</body></html>'
} > index.html
echo "Built $OUT ($(wc -c < "$OUT") bytes) and index.html"
