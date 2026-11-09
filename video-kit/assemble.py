# Detailed explainer: desktop tour + phone section + end card + voice. No captions.
# usage: python3 assemble.py /path/to/<client>-website-explainer.mp4
import json, os, subprocess, sys
import numpy as np
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(f'{D}/plan.json'))
LEN, PS, EC, XF = plan['length'], plan['phone_start'], plan['end_card_at'], 0.6
VOICE = os.path.exists(f'{D}/vo/vo_full.wav') and plan['voice'] == 'real'
OUT = sys.argv[1] if VOICE else sys.argv[1].replace('.mp4', '-draft.mp4')
run = lambda *a: subprocess.run(list(a), check=True)

def frames_to_mp4(folder, out, w, h, start_offset=0.0):
    """screencast frames -> constant 30 fps, on the plan's clock (t = timestamp - t0 + start_offset)"""
    idx = json.load(open(f'{D}/{folder}/index.json')); t0, fr = idx['t0'], idx['frames']
    k = next(i for i, (fn, _) in enumerate(fr) if np.asarray(Image.open(f'{D}/{folder}/{fn}').convert('L').resize((32, 18))).mean() < 200)
    fr = fr[k:]
    with open(f'{D}/{folder}/concat.txt', 'w') as f:
        f.write(f"file '{fr[0][0]}'\nduration {fr[0][1] - t0 + start_offset:.4f}\n")
        for (a, ta), (_, tb) in zip(fr, fr[1:]): f.write(f"file '{a}'\nduration {max(tb - ta, 0.001):.4f}\n")
        f.write(f"file '{fr[-1][0]}'\nduration 1.0\nfile '{fr[-1][0]}'\n")
    run('ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{D}/{folder}/concat.txt', '-vf', f'scale={w}:{h}:flags=lanczos,fps=30,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', out)

# 1. desktop tour and the phone section (screen inside the bezel)
frames_to_mp4('frames_tour', f'{D}/d.mp4', 1920, 1080)
frames_to_mp4('frames_phone', f'{D}/p_screen.mp4', 416, 900)
run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', f'{D}/phone_bg.png', '-i', f'{D}/p_screen.mp4', '-loop', '1', '-i', f'{D}/phone_frame.png', '-filter_complex',
    '[0:v][1:v]overlay=752:90:shortest=1[a];[a][2:v]overlay=0:0:shortest=1,format=yuv420p[v]', '-map', '[v]', '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', f'{D}/p.mp4')

# 2. picture: tour -> phone -> end card, fade out
run('ffmpeg', '-v', 'error', '-y', '-i', f'{D}/d.mp4', '-i', f'{D}/p.mp4', '-loop', '1', '-t', f'{LEN - EC + XF + 0.2:.2f}', '-i', f'{D}/endcard.png', '-filter_complex',
    f"[0:v]trim=duration={PS + 0.05:.3f},fps=30,setsar=1,settb=AVTB[a];[1:v]fps=30,setsar=1,settb=AVTB[b];[2:v]scale=1920:1080,fps=30,format=yuv420p,setsar=1,settb=AVTB[c];"
    f"[a][b]xfade=transition=fade:duration={XF}:offset={PS - XF:.3f}[ab];[ab][c]xfade=transition=fade:duration={XF}:offset={EC - XF:.3f},"
    f"fade=t=out:st={LEN - 0.8:.3f}:d=0.8,format=yuv420p[v]",
    '-map', '[v]', '-t', f'{LEN:.2f}', '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', f'{D}/picture_d.mp4')

# 3. voice (or silence for a timing draft), then mux
if VOICE:
    fc = []
    for i, l in enumerate(plan['lines']):
        a, b = l['src']
        fc.append(f"[0:a]atrim={a - 0.05:.3f}:{b + 0.1:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={b - a + 0.05:.3f}:d=0.1,adelay={int((l['at'] - 0.05) * 1000)}:all=1[a{i}]")
    fc.append("".join(f"[a{i}]" for i in range(len(plan['lines']))) + f"amix=inputs={len(plan['lines'])}:normalize=0,apad,atrim=0:{LEN:.2f},loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={LEN - 0.8:.2f}:d=0.8[out]")
    run('ffmpeg', '-v', 'error', '-y', '-i', f'{D}/vo/vo_full.wav', '-filter_complex', ";".join(fc), '-map', '[out]', '-ar', '48000', '-ac', '2', f'{D}/voice_d.wav')
    audio = ['-i', f'{D}/voice_d.wav']
else:
    audio = ['-f', 'lavfi', '-t', f'{LEN:.2f}', '-i', 'anullsrc=r=48000:cl=stereo']
run('ffmpeg', '-v', 'error', '-y', '-i', f'{D}/picture_d.mp4', *audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'apad',
    '-c:a', 'aac', '-b:a', '192k', '-t', f'{LEN:.2f}', '-movflags', '+faststart', OUT)
print(OUT, f'{os.path.getsize(OUT) / 1e6:.1f} MB', 'voice' if VOICE else 'DRAFT: silent timing check, no voice yet')
