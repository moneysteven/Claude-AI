#!/usr/bin/env bash
# usage: bash tools/build_images.sh   (run from the site folder) — rebuilds every image in assets/img from _source
set -euo pipefail
python3 tools/compose.py
find assets/img -maxdepth 1 -type f ! -name 'hero-poster.jpg' ! -name 'og-image.jpg' -delete
python3 tools/stage_web.py
python3 tools/optimize_images.py _source/web assets/img > content/image-manifest.json
python3 tools/shrink_fallbacks.py assets/img
