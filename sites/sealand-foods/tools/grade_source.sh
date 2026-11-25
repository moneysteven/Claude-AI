#!/usr/bin/env bash
# usage: bash tools/grade_source.sh   (run from the site folder)
# Makes _source/walkthrough-graded.mp4: the phone walkthrough colour-corrected.
# Outside (bright sun) gets a little contrast and colour; inside, the green cast from the lights is removed.
# The two looks blend over 0.8 s as the camera passes through the door (about 11.2 s in).
set -e
EXT="eq=contrast=1.12:saturation=1.2:gamma=0.97"
INT="colorchannelmixer=rr=1.06:gg=0.89:bb=1.01,eq=contrast=1.1:saturation=1.12:gamma=0.96"
ffmpeg -v error -y -i _source/walkthrough.mov -an -filter_complex \
 "[0:v]format=yuv420p,split[a][b];[a]$EXT[x];[b]$INT[y];[x][y]blend=all_expr='A*(1-clip((T-11.2)/0.8\,0\,1))+B*clip((T-11.2)/0.8\,0\,1)',format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p _source/walkthrough-graded.mp4
