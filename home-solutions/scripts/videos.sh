#!/usr/bin/env bash
# Processes the hero + section videos (see BRIEF.md section 0). Run from project root.
set -euo pipefail
mkdir -p public/video
SRC=assets/stock/video-villa-room-light-timelapse.mp4
START=${HERO_START:-4}
VF="trim=start=${START}:duration=14,setpts=PTS-STARTPTS,eq=brightness=0.04:contrast=1.05:saturation=1.08:gamma=1.05,unsharp=5:5:0.6:5:5:0.0,fade=t=in:st=0:d=0.6,fade=t=out:st=13.2:d=0.8"
CRF1080=${CRF1080:-22}; CRF720=${CRF720:-24}
ffmpeg -nostdin -loglevel error -y -i $SRC -an -vf "$VF,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080" \
  -c:v libx264 -preset slow -crf $CRF1080 -profile:v high -pix_fmt yuv420p -movflags +faststart public/video/hero-1080.mp4
ffmpeg -nostdin -loglevel error -y -i $SRC -an -vf "$VF,scale=1280:720:flags=lanczos:force_original_aspect_ratio=increase,crop=1280:720" \
  -c:v libx264 -preset slow -crf $CRF720 -pix_fmt yuv420p -movflags +faststart public/video/hero-720.mp4
ffmpeg -nostdin -loglevel error -y -i $SRC -an -vf "$VF,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080" \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -deadline good -cpu-used 2 public/video/hero-1080.webm
# Poster: first frame after the fade-in (0.7s) so it isn't white.
ffmpeg -nostdin -loglevel error -y -ss 0.7 -i public/video/hero-1080.mp4 -frames:v 1 -c:v libwebp -quality 88 public/video/hero-poster.webp

# Secondary clips: 8s, 720p mp4 + webm, same grade, short fades for a clean loop.
sec() { local in=$1 out=$2 ss=$3 d=${4:-8}
  local fo=$(awk "BEGIN{print $d-0.6}")
  local V="trim=start=${ss}:duration=${d},setpts=PTS-STARTPTS,eq=brightness=0.03:contrast=1.04:saturation=1.06,fade=t=in:st=0:d=0.5,fade=t=out:st=${fo}:d=0.6,scale=1280:720:flags=lanczos:force_original_aspect_ratio=increase,crop=1280:720,fps=30"
  ffmpeg -nostdin -loglevel error -y -i assets/stock/$in -an -vf "$V" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart public/video/$out.mp4
  ffmpeg -nostdin -loglevel error -y -i assets/stock/$in -an -vf "$V" -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -deadline good -cpu-used 3 public/video/$out.webm
}
sec video-hero-ocean-window-palms.mp4 band-windows 0 7.8
sec video-luxury-bathroom.mp4 band-showers 1
sec video-modern-luxury-villa-exterior.mp4 band-security 2
sec video-hotel-room-balcony-view.mp4 band-cta 1
ls -la public/video
