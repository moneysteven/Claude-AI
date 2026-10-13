// Builds the call simulator page from simulator/ and the live call-script.json.
// Used by /admin/simulator (audio loaded from /audio/) and by
// `npm run simulator`, which writes a single self-contained file.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const dir = path.join(config.ROOT, 'simulator');

// JSON inside <script> must not be able to close the tag.
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function render({ embedAudio = false, wrap = true } = {}) {
  const script = JSON.parse(fs.readFileSync(config.scriptFile, 'utf8'));
  const audio = {};
  for (const file of fs.readdirSync(config.audioDir).filter((f) => f.endsWith('.mp3'))) {
    audio[file] = embedAudio
      ? `data:audio/mpeg;base64,${fs.readFileSync(path.join(config.audioDir, file)).toString('base64')}`
      : `/audio/${encodeURIComponent(file)}`;
  }
  const body = `${fs.readFileSync(path.join(dir, 'simulator.html'), 'utf8')}
<script type="application/json" id="call-script">${safeJson(script)}</script>
<script type="application/json" id="call-audio">${safeJson(audio)}</script>
<script>
${fs.readFileSync(path.join(dir, 'simulator.js'), 'utf8')}
</script>
`;
  if (!wrap) return body;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"></head><body>
${body}</body></html>`;
}

module.exports = { render };
