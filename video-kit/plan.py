# Builds plan.json (when each shot starts and how long it holds) from shots.json. No voice: the shot list sets the timing.
# usage: python3 plan.py
import json, os, re
D = os.path.dirname(os.path.abspath(__file__))
shots = json.load(open(f'{D}/shots.json'))['lines']

def hold(text):     # the calm pace Steven approved in v2: about 3.6 words a second, plus a beat at each comma, colon or full stop
    return 0.5 + 0.28 * len(text.split()) + 0.28 * len(re.findall(r'[,.:;]', text))

lines, t = [], 0.0
for s in shots:
    dur = s.get('hold') or hold(s['show'])
    if s['id'] == 'phone': t += 0.6                      # crossfade from the desktop tour into the phone
    if s['id'] == 'close': t += 0.6                      # crossfade into the end card
    t += s['gap']
    lines.append({'id': s['id'], 'at': round(t, 2), 'dur': round(dur, 2), 'show': s['show']})
    t += dur
by = {l['id']: l for l in lines}
plan = {
    'lines': lines,
    'phone_start': round(by['phone']['at'] - 1.4, 2),
    'end_card_at': round(by['close']['at'] - 1.2, 2),
    'length': round(by['close']['at'] + by['close']['dur'] + 1.4, 2),
}
json.dump(plan, open(f'{D}/plan.json', 'w'), indent=1)
print(f"{len(lines)} shots; phone {plan['phone_start']} s; end card {plan['end_card_at']} s; "
      f"total {plan['length']} s ({plan['length'] // 60:.0f}:{plan['length'] % 60:04.1f})")
