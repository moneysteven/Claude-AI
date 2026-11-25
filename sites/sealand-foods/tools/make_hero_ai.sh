#!/usr/bin/env bash
# usage: bash tools/make_hero_ai.sh   (run from the site folder)
# Hero without people: the AI walk-in (_source/ai/walkin-ai.mp4, made in Higgsfield MiniMax H3 from two person-free stills:
# _source/ai/storefront-clean.png -> _source/ai/interior-clean.png), dissolving into the real footage of the drinks
# chillers (15.0–17.4 s, nobody in shot).
#   hero-mobile.*  9:16 for phones      hero.*  16:9 band (y=480 of 2560) for wide screens
# Also rebuilds the two gallery loops without people.
set -e
read RR GG BB < _source/ai/interior-gains.txt || true
M=_source/walkthrough-graded.mp4; AI=_source/ai/walkin-ai.mp4; V=assets/video; I=assets/img
X264="-an -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -movflags +faststart"
VP9="-an -c:v libvpx-vp9 -b:v 0 -deadline good -cpu-used 4 -row-mt 1"
AIDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $AI)
OFF=$(python3 -c "print(round($AIDUR - 0.6, 3))")
# 1440x2560 @24 fps master of the whole hero
ffmpeg -v error -y -i $AI -ss 15.0 -t 2.4 -i $M -filter_complex \
 "[0:v]fps=24,scale=1440:2560,setsar=1,format=yuv420p[a];[1:v]fps=24,scale=1440:2560,colorchannelmixer=rr=$RR:gg=$GG:bb=$BB,setsar=1,format=yuv420p[b];[a][b]xfade=transition=fade:duration=0.6:offset=$OFF[v]" \
 -map "[v]" -an -c:v libx264 -crf 14 -preset fast _source/ai/hero-master.mp4
ffmpeg -v error -y -i _source/ai/hero-master.mp4 -vf "scale=720:1280:flags=lanczos" $X264 -crf 26 $V/hero-mobile.mp4
ffmpeg -v error -y -i _source/ai/hero-master.mp4 -vf "crop=1440:810:0:480,scale=1920:1080:flags=lanczos" $X264 -crf 27 $V/hero.mp4
for n in hero hero-mobile; do ffmpeg -v error -y -i $V/$n.mp4 $VP9 -crf 38 $V/$n.webm; done
ffmpeg -v error -y -i $V/hero.mp4 -frames:v 1 -q:v 3 $I/hero-poster.jpg
ffmpeg -v error -y -i $V/hero-mobile.mp4 -frames:v 1 -q:v 3 $I/hero-poster-mobile.jpg
# gallery loops (540x960): the AI walk-in, and inside (the end of the walk-in into the chillers; no people)
ffmpeg -v error -y -i $AI -vf "fps=24,scale=540:960:flags=lanczos" $X264 -crf 27 $V/loop-walkin.mp4
LS=$(python3 -c "print(round($AIDUR - 2.6, 3))")
ffmpeg -v error -y -ss $LS -i _source/ai/hero-master.mp4 -vf "scale=540:960:flags=lanczos" $X264 -crf 28 $V/loop-inside.mp4
for n in loop-walkin loop-inside; do
  ffmpeg -v error -y -i $V/$n.mp4 $VP9 -crf 40 $V/$n.webm
  ffmpeg -v error -y -ss 1 -i $V/$n.mp4 -frames:v 1 -q:v 3 $I/$n-poster.jpg
done
ls -la $V
