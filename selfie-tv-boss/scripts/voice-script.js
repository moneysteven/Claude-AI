// Rebuilds VOICE-SCRIPT.md from call-script.json: `npm run voice-script`
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const script = JSON.parse(fs.readFileSync(path.join(root, 'call-script.json'), 'utf8'));
const audioDir = path.join(root, 'public', 'audio');

const WHEN = {
  greeting: 'Start of every call',
  menu: 'The options menu',
  noInput: 'Nobody pressed a key',
  invalid: 'Wrong key pressed',
  questionsIntro: 'After they pick a service, before the questions',
  thanks: 'End of the call, after the questions',
  connecting: 'They pressed 0',
  ownerUnavailable: "You didn't pick up after they pressed 0",
  goodbye: 'No choice after 3 tries',
  voicemail: 'Answering machine picked up',
};

const done = (file) => (fs.existsSync(path.join(audioDir, file)) ? '✅' : '⬜');
const cell = (t) => String(t).replace(/\|/g, '\\|');

let out = `# Voice Script: what to record

Every line the phone system can say. Record each one in your own voice (or a
voice actor's), export it as **MP3**, and save it in \`public/audio/\` with
the **exact file name** shown. Any line you haven't recorded yet is read by
the computer voice, so you can record them one at a time. ✅ = recording
found, ⬜ = not recorded yet.

The recordings in \`public/audio/\` right now are in the **Ainsley** voice
(made with Higgsfield). To swap any line for your own voice, record it and
overwrite that file.

Want different wording or different questions? Edit \`call-script.json\`,
then **replace or delete that line's MP3** (otherwise the old recording keeps
playing), and run \`npm run voice-script\` to refresh this list.

## Recording tips

- Quiet room, phone or USB mic about a hand-width from your mouth.
- Smile while you talk: it comes through on the phone.
- Talk like you're chatting with one customer, not reading a script. Short
  pauses at the commas and full stops make it flow.
- Leave about half a second of silence at the start and end. No music under
  the menu or questions (it makes them hard to hear on phone speakers).
- Free tools: **Audacity** (computer) or your phone's voice recorder app.
  In Audacity: *Effect → Normalize* (-1 dB), then *File → Export → MP3*
  (mono, 64–128 kbps is plenty for phone calls).

## How a call flows

1. Thank-you greeting → options (press 1–6 for a service, 7 for the website link, 0 to reach you, * to repeat)
2. Pressed 7: they get a text with your website link → call ends
3. Pressed 1–6: short pitch for that service (a booking link is texted to
   them quietly in the background) → questions, each answered after a beep → thank you

## Main lines

| | File name | When it plays | Say this |
|---|---|---|---|
`;
for (const [key, line] of Object.entries(script.lines)) {
  out += `| ${done(line.audio)} | \`${line.audio}\` | ${WHEN[key] || key} | ${cell(line.text)} |\n`;
}
out += `\n## Key lines (after the caller presses a number)\n\n| | Key | Service | File name | Say this |\n|---|---|---|---|---|\n`;
for (const o of script.options) {
  out += `| ${done(o.audio)} | ${o.digit} | ${o.service} | \`${o.audio}\` | ${cell(o.text)} |\n`;
}
if (script.website) {
  const w = script.website;
  out += `| ${done(w.audio)} | ${w.digit} | Website link (texted) | \`${w.audio}\` | ${cell(w.text)} |\n`;
}
out += `\n## Questions (asked in this order for every service except those with their own list below)\n\n| | # | Dashboard label | Answer time | File name | Say this |\n|---|---|---|---|---|---|\n`;
(script.questions || []).forEach((q, i) => {
  out += `| ${done(q.audio)} | ${i + 1} | ${q.label} | ${q.maxSeconds || 30}s | \`${q.audio}\` | ${cell(q.text)} |\n`;
});
for (const o of script.options.filter((x) => x.questions)) {
  out += `\n## ${o.service} questions (asked instead of the ones above when they press ${o.digit})\n\n| | # | Dashboard label | Answer time | File name | Say this |\n|---|---|---|---|---|---|\n`;
  o.questions.forEach((q, i) => {
    out += `| ${done(q.audio)} | ${i + 1} | ${q.label} | ${q.maxSeconds || 30}s | \`${q.audio}\` | ${cell(q.text)} |\n`;
  });
}
out += `
> The computer voice spells "D J" and "T V" with spaces so it pronounces
> them as letters. When you record yourself, just say them normally.
`;
fs.writeFileSync(path.join(root, 'VOICE-SCRIPT.md'), out);
console.log('VOICE-SCRIPT.md updated');
