#!/usr/bin/env bash
# Business's own phone videos (assets/own/video, 384x848 portrait, WhatsApp):
#  - intro-cutting.mp4      -> public/video/intro.{mp4,webm} + intro-poster.webp (site intro)
#  - the other three clips  -> public/video/reel.{mp4,webm} (hero loop, crossfaded)
#                              + reel-blur.mp4 (tiny pre-blurred backdrop for wide screens)
set -euo pipefail
cd "$(dirname "$0")/.."
V=assets/own/video; O=public/video; mkdir -p $O
# Phone screen recordings: picture area is ~x4-378, y50-808 with rounded corners and a
# home-indicator bar below, so crop a clean 364x740 window first, then scale 1.19x.
C="crop=364:740:10:60,"
W=432; H=878
G="scale=${W}:${H}:flags=lanczos,setsar=1,fps=30,eq=brightness=0.02:contrast=1.04:saturation=1.08"

# Intro: whole clip (2.66s), quick fade-in.
ffmpeg -nostdin -loglevel error -y -i $V/intro-cutting.mp4 -an -vf "$C$G,fade=t=in:st=0:d=0.25" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart $O/intro.mp4
ffmpeg -nostdin -loglevel error -y -i $V/intro-cutting.mp4 -an -vf "$C$G,fade=t=in:st=0:d=0.25" -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -deadline good -cpu-used 2 $O/intro.webm
ffmpeg -nostdin -loglevel error -y -ss 0.4 -i $O/intro.mp4 -frames:v 1 -c:v libwebp -quality 85 $O/intro-poster.webp

# Reel segments (start, duration).
T=$(mktemp -d)
seg() { ffmpeg -nostdin -loglevel error -y -ss $2 -t $3 -i $1 -an -vf "$4$C$G" -c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p $T/$5.mp4; }
seg $V/shower-balcony-railing.mp4     0    4.35 ""                    s1   # frameless shower -> glass railing balcony, sea view
seg $V/building-glass-balconies.mp4   0.5  7.0  ""                    s2   # building with glass balconies
seg $V/building-glass-balconies.mp4   16   9.0  ""                    s3   # front elevation, glass balcony
seg $V/building-glass-balconies.mp4   40   6.5  ""                    s4   # glass stair railing -> branded truck
# Instagram reel (letterboxed landscape inside portrait): take the close villa shots and
# place the cropped band over a blurred, zoomed copy so the frame is full.
ffmpeg -nostdin -loglevel error -y -ss 9 -t 5.5 -i $V/instagram-villa-hanover.mp4 -an -filter_complex \
 "[0:v]crop=360:360:12:300,split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2,eq=brightness=0.06[bg];[b]scale=${W}:-2[fg];[bg][fg]overlay=0:(H-h)/2,setsar=1,fps=30,eq=brightness=0.02:contrast=1.04:saturation=1.08" \
 -c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p $T/s5.mp4
# Crossfade them (0.6s) into one loop; last->first handled by a fade on both ends.
X=0.6
d() { ffprobe -v error -show_entries format=duration -of csv=p=0 $1; }
o1=$(awk "BEGIN{print $(d $T/s1.mp4)-$X}"); o2=$(awk "BEGIN{print $o1+$(d $T/s2.mp4)-$X}"); o3=$(awk "BEGIN{print $o2+$(d $T/s3.mp4)-$X}"); o4=$(awk "BEGIN{print $o3+$(d $T/s4.mp4)-$X}")
ffmpeg -nostdin -loglevel error -y -i $T/s1.mp4 -i $T/s2.mp4 -i $T/s3.mp4 -i $T/s5.mp4 -i $T/s4.mp4 -filter_complex \
 "[0][1]xfade=transition=fade:duration=$X:offset=$o1[x1];[x1][2]xfade=transition=fade:duration=$X:offset=$o2[x2];[x2][3]xfade=transition=fade:duration=$X:offset=$o3[x3];[x3][4]xfade=transition=fade:duration=$X:offset=$o4,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -preset fast -crf 14 $T/reel.mp4
ffmpeg -nostdin -loglevel error -y -i $T/reel.mp4 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart $O/reel.mp4
ffmpeg -nostdin -loglevel error -y -i $T/reel.mp4 -c:v libvpx-vp9 -b:v 0 -crf 35 -row-mt 1 -deadline good -cpu-used 2 $O/reel.webm
ffmpeg -nostdin -loglevel error -y -i $T/reel.mp4 -vf "scale=144:318,boxblur=12:3,eq=brightness=0.05:saturation=1.1" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart $O/reel-blur.mp4
ffmpeg -nostdin -loglevel error -y -ss 1.0 -i $O/reel.mp4 -frames:v 1 -c:v libwebp -quality 85 $O/reel-poster.webp
rm -rf $T
ls -la $O/intro* $O/reel*
for f in $O/intro.mp4 $O/reel.mp4; do echo "$f $(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)s"; done
