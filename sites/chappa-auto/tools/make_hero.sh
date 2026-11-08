#!/usr/bin/env bash
# usage: bash tools/make_hero.sh   (run from the site folder; needs ffmpeg)
# No client video was supplied, so the hero is built from the real Molynes Road storefront photo (master prompt, recipe C):
# shot A = slow push on the whole facade, shot B = slow pull-back framed on the entrance and the main CA sign. ~10.8 s, 1920x1080.
set -euo pipefail
SRC=_source/photos/IMG-20250807-WA0012-e1759838818351.jpg
mkdir -p assets/video assets/img
ffmpeg -v error -y -i "$SRC" -i "$SRC" -filter_complex "\
[0:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='1+0.10*on/180':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1920x1080:fps=30,setsar=1[a];\
[1:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='1.32-0.12*on/180':x='max(0,min(iw-iw/zoom,(0.47+0.03*on/180)*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,0.55*ih-ih/zoom/2))':d=180:s=1920x1080:fps=30,setsar=1[b];\
[a][b]xfade=transition=fade:duration=1.2:offset=4.8,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf 23 -profile:v high -movflags +faststart assets/video/hero.mp4
ffmpeg -v error -y -i assets/video/hero.mp4 -c:v libvpx-vp9 -crf 38 -b:v 0 -deadline good -cpu-used 4 -row-mt 1 -an assets/video/hero.webm
ffmpeg -v error -y -ss 0 -i assets/video/hero.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 6 assets/img/hero-poster.jpg   # light poster: it is the LCP image
ls -la assets/video/hero.* assets/img/hero-poster.jpg
