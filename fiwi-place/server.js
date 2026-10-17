// Serves the FiWi Place website on Hostinger's Node.js hosting (Express preset).
// Only the page, css, js and assets folders are public; this file, package.json,
// the README and the original photos in photos/ are not.
const path = require('path');
const express = require('express');

const app = express();
const day = 24 * 60 * 60 * 1000;

app.disable('x-powered-by');
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: day }));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((req, res) => res.redirect('/'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`FiWi Place website running on port ${port}`));
