# usage: python3 make_voice.py script.json vo [voice] [speed]   (defaults: af_heart, a warm female voice, at 0.9 = calm pace)
# Free, local voiceover with Kokoro (no account, no credits). script.json: {"lines": [{"say": ...}, ...]} or a plain list of strings.
# Writes vo/vo_full.wav (all paragraphs joined with 0.6 s gaps) and vo/segments.json with each paragraph's exact
# [start, end] in that file; plan.py reads them.
# Setup once per machine:
#   pip install kokoro-onnx soundfile
#   mkdir -p ~/.cache/kokoro && cd ~/.cache/kokoro
#   curl -L -O https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
#   curl -L -O https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
import json, os, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
data = json.load(open(sys.argv[1])); lines = [l if isinstance(l, str) else l["say"] for l in (data["lines"] if isinstance(data, dict) else data)]
out = sys.argv[2]; voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 0.9
os.makedirs(out, exist_ok=True)
home = os.path.expanduser("~/.cache/kokoro")
k = Kokoro(f"{home}/kokoro-v1.0.onnx", f"{home}/voices-v1.0.bin")
parts, segs, t, sr = [], [], 0.3, None
for i, text in enumerate(lines, 1):
    s, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    sf.write(f"{out}/line{i:02d}.wav", s, sr)
    if not parts: parts.append(np.zeros(int(0.3 * sr), dtype=s.dtype))
    parts += [s, np.zeros(int(0.6 * sr), dtype=s.dtype)]
    segs.append([round(t, 3), round(t + len(s) / sr, 3)]); t += len(s) / sr + 0.6
sf.write(f"{out}/vo_full.wav", np.concatenate(parts), sr)
json.dump({"voice": voice, "speed": speed, "segments": segs}, open(f"{out}/segments.json", "w"), indent=1)
print(f"{len(lines)} paragraphs, {t:.1f} s ->", f"{out}/vo_full.wav")
