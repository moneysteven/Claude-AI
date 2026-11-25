#!/usr/bin/env bash
# usage: bash tools/make_hero.sh   (run from the site folder, after tools/grade_source.sh)
# Hero = the walk-in (storefront -> door -> inside), 10 s from 4.6 s.
#   hero.mp4/.webm         16:9 crop for wide screens      hero-mobile.mp4/.webm   9:16 for phones
# Gallery loops: loop-walkin (outside, walking up) and loop-inside (pan across the deli counter).
set -e
M=_source/walkthrough-graded.mp4; V=assets/video; I=assets/img; mkdir -p $V $I
X264="-an -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -movflags +faststart"
VP9="-an -c:v libvpx-vp9 -b:v 0 -deadline good -cpu-used 4 -row-mt 1"
ffmpeg -v error -y -ss 4.6 -t 10 -i $M -vf "crop=2160:1215:0:700,scale=1920:1080:flags=lanczos,fps=30" $X264 -crf 26 $V/hero.mp4
ffmpeg -v error -y -ss 4.6 -t 10 -i $M -vf "scale=720:1280:flags=lanczos,fps=30" $X264 -crf 27 $V/hero-mobile.mp4
for n in hero hero-mobile; do
  ffmpeg -v error -y -i $V/$n.mp4 $VP9 -crf 38 $V/$n.webm
done
ffmpeg -v error -y -i $V/hero.mp4 -frames:v 1 -q:v 3 $I/hero-poster.jpg
ffmpeg -v error -y -i $V/hero-mobile.mp4 -frames:v 1 -q:v 3 $I/hero-poster-mobile.jpg
# gallery loops (portrait, 540x960)
ffmpeg -v error -y -ss 4.8 -t 7 -i $M -vf "scale=540:960:flags=lanczos,fps=30" $X264 -crf 28 $V/loop-walkin.mp4
ffmpeg -v error -y -ss 15.6 -t 7 -i $M -vf "scale=540:960:flags=lanczos,fps=30" $X264 -crf 28 $V/loop-inside.mp4
for n in loop-walkin loop-inside; do
  ffmpeg -v error -y -i $V/$n.mp4 $VP9 -crf 40 $V/$n.webm
  ffmpeg -v error -y -ss 1 -i $V/$n.mp4 -frames:v 1 -q:v 3 $I/$n-poster.jpg
done
ls -la $V $I
