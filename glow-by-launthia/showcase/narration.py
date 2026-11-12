"""Render a film's voiceover to one audio track, timed to its scenes, with the offline RHVoice engine.

    python3 showcase/narration.py showcase/src/showcase.html out.wav [voice=slt]

The lines and cue times are read from the film's own `var VO = [...]`, so the text lives in one place.
Each line is spoken at its cue; a line that would run into the next one is sped up slightly (max 1.2x).
Needs RHVoice (RHVoice-test, e.g. apt install rhvoice rhvoice-english) and ffmpeg.
"""
import json
import pathlib
import re
import subprocess
import sys
import tempfile

film, out = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else 'slt'
DUR = 60.0

src = pathlib.Path(film).read_text(encoding='utf-8')
lines = json.loads(re.search(r'var VO = (\[.*?\]);', src, re.S).group(1))
tmp = pathlib.Path(tempfile.mkdtemp(prefix='vo-'))


def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


parts = []
for i, (cue, text) in enumerate(lines):
    raw = tmp / f'{i:02d}-raw.wav'
    subprocess.run(['RHVoice-test', '-p', voice, '-q', 'max', '-o', str(raw)], input=text, text=True, check=True)
    d = duration(raw)
    nxt = lines[i + 1][0] if i + 1 < len(lines) else DUR - 0.3
    room = nxt - cue - 0.25
    tempo = min(1.2, max(1.0, d / room)) if room > 0 else 1.0
    fitted = tmp / f'{i:02d}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', f'atempo={tempo:.3f},aresample=48000', '-ac', '1', str(fitted)], check=True)
    parts.append((cue, fitted))
    print(f'{cue:5.1f}s  {d:4.2f}s{"  x%.2f" % tempo if tempo > 1.001 else ""}  {text}')

inputs, chains = [], []
for i, (cue, path) in enumerate(parts):
    inputs += ['-i', str(path)]
    ms = int(round(cue * 1000))
    chains.append(f'[{i}:a]adelay={ms}|{ms}[d{i}]')
mix = ''.join(f'[d{i}]' for i in range(len(parts)))
graph = ';'.join(chains) + f';{mix}amix=inputs={len(parts)}:normalize=0,' \
    'highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=180,' \
    f'loudnorm=I=-16:TP=-1.5:LRA=9,apad=whole_dur={DUR},atrim=0:{DUR},aformat=sample_rates=48000:channel_layouts=stereo[out]'
subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', graph, '-map', '[out]', out], check=True)
print(f'wrote {out} ({duration(out):.1f}s)')
