// Booking requests from the website form.
const express = require('express');
const store = require('./store');
const phone = require('./phone');
const { notifyOwner } = require('./twilio-client');

const router = express.Router();
router.use(express.json({ limit: '20kb' }));

const SERVICES = ['Project Managing', 'Hosting', 'DJ', 'Entertainer', 'Movie Actor', 'Promotions', 'Not sure yet'];

// Simple per-IP limit so the form can't be spammed.
const recent = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 5;
}

const clean = (v, max = 200) => String(v || '').trim().slice(0, max);

router.post('/bookings', (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot field: bots fill it in
  if (rateLimited(req.ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests — please try again later or call us.' });
  }

  const booking = {
    id: `B${Date.now().toString(36).toUpperCase()}`,
    name: clean(b.name, 100),
    phone: clean(b.phone, 40),
    email: clean(b.email, 120),
    services: (Array.isArray(b.services) ? b.services : [b.services]).filter((s) => SERVICES.includes(s)),
    eventName: clean(b.eventName, 150),
    eventDate: clean(b.eventDate, 40),
    venue: clean(b.venue, 150),
    message: clean(b.message, 2000),
    status: 'new',
    createdAt: new Date().toISOString(),
  };

  const errors = [];
  if (!booking.name) errors.push('your name');
  if (!phone.normalize(booking.phone) && !/^\S+@\S+\.\S+$/.test(booking.email)) errors.push('a phone number or email');
  if (!booking.services.length) errors.push('at least one service');
  if (errors.length) return res.status(400).json({ ok: false, error: `Please add ${errors.join(', ')}.` });

  store.append('bookings', booking);
  notifyOwner(
    `New booking request: ${booking.name} (${booking.phone || booking.email}) — ${booking.services.join(', ')}` +
      `${booking.eventDate ? ` on ${booking.eventDate}` : ''}${booking.eventName ? ` for "${booking.eventName}"` : ''}.`
  );
  res.json({ ok: true, id: booking.id });
});

module.exports = router;
