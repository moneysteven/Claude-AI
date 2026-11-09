#!/usr/bin/env bash
# Rebuilds the hero video and the muted background loops from the originals in _source/.  Run from the site folder.
# loop <name> <source> <start> <duration> [extra filters before scaling]
set -euo pipefail
FV=_source/Full-videos; LV=_source/Website-background-loops; OUT=assets/video; IMG=assets/img
mkdir -p "$OUT"
# Hero: the supplied 12 s "official Hero" loop.  MP4 + WebM + poster.
ffmpeg -v error -y -i "$LV/KennysItalianCafe-official-Hero-loop.mp4" -vf "scale='min(1920,iw)':-2:flags=lanczos,fps=30" -an \
  -c:v libx264 -preset slow -crf 24 -profile:v high -pix_fmt yuv420p -movflags +faststart "$OUT/hero.mp4"
ffmpeg -v error -y -i "$OUT/hero.mp4" -c:v libvpx-vp9 -crf 38 -b:v 0 -deadline good -cpu-used 4 -row-mt 1 -an "$OUT/hero.webm"
ffmpeg -v error -y -ss 0.4 -i "$OUT/hero.mp4" -frames:v 1 -q:v 3 "$IMG/hero-poster.jpg"
loop() {  # name source start duration [prefilter] [poster_time]
  local name=$1 src=$2 ss=$3 t=$4 pre=${5:-} pt=${6:-0.3}
  ffmpeg -v error -y -ss "$ss" -t "$t" -i "$src" -vf "${pre:+$pre,}scale='min(960,iw)':-2:flags=lanczos,fps=30,eq=contrast=1.04:saturation=1.08" -an \
    -c:v libx264 -preset slow -crf 27 -profile:v high -pix_fmt yuv420p -movflags +faststart "$OUT/$name.mp4"
  ffmpeg -v error -y -ss "$pt" -i "$OUT/$name.mp4" -frames:v 1 -q:v 4 "$IMG/$name-poster.jpg"
}
loop fridays      "$LV/KennysItalianCafe-FreshFiDayz-Uptown-Fridayz-loop.mp4" 0 10
loop bar-night    "$FV/KennysItalianCafe-XsLxLickleJa-Norman-Manley-Blvd-part2.mp4" 50 10 "" 4.5
loop kitchen      "$LV/KennysItalianCafe-FoodBoss-Jamaica-Italian-Food-loop.mp4" 0 10
loop pizza-making "$FV/KennysItalianCafe-FoodBoss-Jamaica-Italian-Food-part1.mp4" 285.6 7
loop flames       "$FV/KennysItalianCafe-FoodBoss-Jamaica-Italian-Food-part1.mp4" 392 9
loop dining-day   "$FV/KennysItalianCafe-FoodBoss-Jamaica-Italian-Food-part1.mp4" 97.6 9
loop night-garden "$FV/KennysItalianCafe-SwopesSaidIt-short.mp4" 24.6 9 "crop=324:590:0:24" 2
loop birthday     "$FV/KennysItalianCafe-SugaLifestyle-Birthday-throwback.mp4" 22 12 "crop=204:360:138:0"
loop interview    "$LV/KennysItalianCafe-TravelWithThePLUG-Behind-the-Scenes-loop.mp4" 0 12
ls -la "$OUT"
