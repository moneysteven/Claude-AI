# Builds plan.json (when each line plays) from script.json and the line durations:
# real ones from vo/segments.json once the voice exists, otherwise an estimate (for a silent timing draft).
# usage: python3 plan.py
import json, os, re
D = os.path.dirname(os.path.abspath(__file__))
script = json.load(open(f'{D}/script.json'))['lines']
real = json.load(open(f'{D}/vo/segments.json'))['segments'] if os.path.exists(f'{D}/vo/segments.json') else None

def estimate(text):     # about 2.55 words a second, plus a short pause at each comma, colon or full stop
    return len(text.split()) / 2.55 + 0.22 * len(re.findall(r'[,.:;]', text))

lines, t = [], 0.0
for i, l in enumerate(script):
    dur = (real[i][1] - real[i][0]) if real else estimate(l['say'])
    if l['id'] == 'phone': t += 0.6                      # crossfade from the desktop tour into the phone
    if l['id'] == 'close': t += 0.6                      # crossfade into the end card
    t += l['gap']
    lines.append({'id': l['id'], 'at': round(t, 2), 'dur': round(dur, 2), 'say': l['say'],
                  'src': real[i] if real else None})
    t += dur
by = {l['id']: l for l in lines}
plan = {
    'voice': 'real' if real else 'estimate',
    'lines': lines,
    'phone_start': round(by['phone']['at'] - 1.4, 2),
    'end_card_at': round(by['close']['at'] - 1.2, 2),
    'length': round(by['close']['at'] + by['close']['dur'] + 1.4, 2),
}
json.dump(plan, open(f'{D}/plan.json', 'w'), indent=1)
print(f"voice: {plan['voice']}; {len(lines)} lines; phone {plan['phone_start']} s; "
      f"end card {plan['end_card_at']} s; total {plan['length']} s ({plan['length'] // 60:.0f}:{plan['length'] % 60:04.1f})")
