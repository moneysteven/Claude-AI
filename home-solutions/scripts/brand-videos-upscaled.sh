#!/usr/bin/env bash
# Web encodes from the AI-upscaled masters (Higgsfield / ByteDance upscaler,
# 1080p) in assets/own/video/upscaled/. The intro is slowed to 0.62x (the 60fps
# master keeps it smooth) so the handwritten tagline has time to write itself.
set -euo pipefail
cd "$(dirname "$0")/.."
U=assets/own/video/upscaled; O=public/video
G="eq=brightness=0.02:contrast=1.04:saturation=1.08,unsharp=5:5:0.35:5:5:0"
ffmpeg -nostdin -loglevel error -y -i $U/intro-cutting-1080p60.mp4 -an -vf "setpts=PTS/0.62,fps=30,$G,fade=t=in:st=0:d=0.3" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart $O/intro.mp4
ffmpeg -nostdin -loglevel error -y -i $U/intro-cutting-1080p60.mp4 -an -vf "setpts=PTS/0.62,fps=30,$G,fade=t=in:st=0:d=0.3" -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 2 $O/intro.webm
ffmpeg -nostdin -loglevel error -y -ss 0.6 -i $O/intro.mp4 -frames:v 1 -c:v libwebp -quality 85 $O/intro-poster.webp
ffmpeg -nostdin -loglevel error -y -i $U/reel-1080p.mp4 -an -vf "scale=1080:2192,setsar=1" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart $O/reel.mp4
ffmpeg -nostdin -loglevel error -y -i $U/reel-1080p.mp4 -an -vf "scale=1080:2192,setsar=1" -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -deadline good -cpu-used 3 $O/reel.webm
ffmpeg -nostdin -loglevel error -y -ss 1.0 -i $O/reel.mp4 -frames:v 1 -c:v libwebp -quality 85 $O/reel-poster.webp
ls -la $O/intro* $O/reel*
ffprobe -v error -show_entries format=duration -of csv=p=0 $O/intro.mp4
