// Rebuilds VOICE-SCRIPT.md from call-script.json: `npm run voice-script`
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const script = JSON.parse(fs.readFileSync(path.join(root, 'call-script.json'), 'utf8'));
const audioDir = path.join(root, 'public', 'audio');

const WHEN = {
  greeting: 'Start of every outgoing call',
  inboundGreeting: 'When someone calls YOUR Twilio number',
  menu: 'The options menu',
  noInput: 'Nobody pressed a key',
  invalid: 'Wrong key pressed',
  questionsIntro: 'After they pick a service, before the questions',
  thanks: 'End of the call, after the questions',
  connecting: 'They pressed 0',
  ownerUnavailable: "You didn't pick up after they pressed 0",
  optOut: 'They pressed 9 (removed from list)',
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

Want different wording or different questions? Edit \`call-script.json\`,
then run \`npm run voice-script\` to refresh this list.

## Recording tips

- Quiet room, phone or USB mic about a hand-width from your mouth.
- Smile while you talk: it comes through on the phone.
- Leave about half a second of silence at the start and end. No music under
  the menu or questions (it makes them hard to hear on phone speakers).
- Free tools: **Audacity** (computer) or your phone's voice recorder app.
  In Audacity: *Effect → Normalize* (-1 dB), then *File → Export → MP3*
  (mono, 64–128 kbps is plenty for phone calls).

## How a call flows

1. Greeting → menu (press 1–6 for a service, 0 to reach you, 9 to opt out)
2. Short pitch for the service they picked
3. Questions intro, then each question below, answered after a beep
4. Thank you → call ends

## Main lines

| | File name | When it plays | Say this |
|---|---|---|---|
`;
for (const [key, line] of Object.entries(script.lines)) {
  out += `| ${done(line.audio)} | \`${line.audio}\` | ${WHEN[key] || key} | ${cell(line.text)} |\n`;
}
out += `\n## Service lines (after the caller presses a number)\n\n| | Key | Service | File name | Say this |\n|---|---|---|---|---|\n`;
for (const o of script.options) {
  out += `| ${done(o.audio)} | ${o.digit} | ${o.service} | \`${o.audio}\` | ${cell(o.text)} |\n`;
}
out += `\n## Questions (asked in this order; answers show in your dashboard)\n\n| | # | Dashboard label | Answer time | File name | Say this |\n|---|---|---|---|---|---|\n`;
(script.questions || []).forEach((q, i) => {
  out += `| ${done(q.audio)} | ${i + 1} | ${q.label} | ${q.maxSeconds || 30}s | \`${q.audio}\` | ${cell(q.text)} |\n`;
});
out += `
> The computer voice spells "D J" and "T V" with spaces so it pronounces
> them as letters. When you record yourself, just say them normally.
`;
fs.writeFileSync(path.join(root, 'VOICE-SCRIPT.md'), out);
console.log('VOICE-SCRIPT.md updated');
