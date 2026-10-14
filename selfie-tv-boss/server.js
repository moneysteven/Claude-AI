require('dotenv').config();
const path = require('path');
const express = require('express');
const config = require('./src/config');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use('/voice', require('./src/voice'));
app.use(require('./src/events').router);
app.use('/api', require('./src/api'));
app.use('/admin', require('./src/admin'));
// Fonts and media rarely change: let browsers keep them, so pages switch instantly.
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), { maxAge: '365d', immutable: true }));
app.use('/media', express.static(path.join(__dirname, 'public', 'media'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(config.port, () => {
  console.log(`Selfie TV Boss is live on http://localhost:${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}/admin`);
  console.log(`Twilio webhook (set on your number): ${config.publicUrl}/voice/answer`);
});
