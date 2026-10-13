// Upcoming events: managed from /admin, shown on the website.
const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const store = require('./store');

const flyerDir = path.join(config.dataDir, 'flyers');
const ROLES = ['Hosting', 'DJ', 'Entertainer', 'Movie Actor', 'Promotions', 'Project Managing', 'Appearance'];

// Today's date as YYYY-MM-DD in the business time zone.
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.calling.timezone }).format(new Date());
}

function sortByDate(events) {
  return events.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

function upcoming() {
  const t = today();
  return sortByDate(store.readAll('events').filter((e) => e.date >= t));
}

const clean = (v, max = 200) => String(v || '').trim().slice(0, max);

function safeLink(v) {
  const s = clean(v, 500);
  return /^https?:\/\//i.test(s) ? s : '';
}

// Save a flyer sent from the dashboard as a base64 data URL (resized in the browser).
function saveFlyer(id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw new Error('Flyer is too big (max 4 MB).');
  fs.mkdirSync(flyerDir, { recursive: true });
  const name = `${id}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(flyerDir, name), buf);
  return name;
}

function removeFlyer(name) {
  if (!name) return;
  fs.rm(path.join(flyerDir, path.basename(name)), { force: true }, () => {});
}

// Create or update an event from dashboard form fields.
function saveEvent(body) {
  const fields = {
    title: clean(body.title, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '',
    time: /^\d{2}:\d{2}$/.test(body.time) ? body.time : '',
    venue: clean(body.venue, 150),
    city: clean(body.city, 80),
    role: ROLES.includes(body.role) ? body.role : '',
    description: clean(body.description, 1000),
    ticketUrl: safeLink(body.ticketUrl),
  };
  if (!fields.title || !fields.date) throw new Error('An event needs at least a name and a date.');

  const events = store.readAll('events');
  let event = events.find((e) => e.id === body.id);
  if (!event) {
    event = { id: `E${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString() };
    events.push(event);
  }
  const flyer = saveFlyer(event.id, body.flyerData);
  if (flyer || body.removeFlyer === 'on') {
    removeFlyer(event.flyer);
    event.flyer = flyer || '';
  }
  Object.assign(event, fields, { updatedAt: new Date().toISOString() });
  store.writeAll('events', events);
  return event;
}

function deleteEvent(id) {
  const events = store.readAll('events');
  const event = events.find((e) => e.id === id);
  if (!event) return;
  removeFlyer(event.flyer);
  store.writeAll('events', events.filter((e) => e !== event));
}

const router = express.Router();
router.use('/flyers', express.static(flyerDir, { maxAge: '7d' }));
router.get('/api/events', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(upcoming().map(({ createdAt, updatedAt, ...e }) => ({ ...e, flyer: e.flyer ? `/flyers/${e.flyer}` : '' })));
});

module.exports = { router, ROLES, today, sortByDate, saveEvent, deleteEvent };
