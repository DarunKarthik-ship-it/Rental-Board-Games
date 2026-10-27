// Admin API. Every route requires a valid session and a CSRF token on state-changing requests
// (enforced in app.js before this router is reached).
const express = require('express');
const { HttpError } = require('../lib/util');
const { validateGame, validateSettings } = require('../services/validation');
const bookings = require('../services/bookings');
const games = require('../services/games');
const settings = require('../services/settings');
const { dashboard, listRentals } = require('../services/dashboard');
const { customerUrl } = require('../services/whatsapp');

function parseId(value) {
  if (!/^\d+$/.test(value)) throw new HttpError(404, 'Not found.');
  return Number(value);
}

function adminRoutes({ db, ctx }) {
  const router = express.Router();

  router.get('/dashboard', (_req, res) => res.json(dashboard(db, ctx())));

  router.get('/bookings', (req, res) => res.json(bookings.listBookings(db, req.query, ctx())));

  router.get('/bookings/:id', (req, res) => {
    const booking = bookings.getBookingById(db, parseId(req.params.id), ctx());
    if (!booking) throw new HttpError(404, 'Booking not found.');
    const business = settings.getSetting(db, 'business_name');
    res.json({
      booking,
      transitions: bookings.TRANSITIONS[booking.status],
      whatsapp: {
        confirmation: customerUrl(booking, 'confirmation', business),
        reminder: customerUrl(booking, 'reminder', business),
      },
    });
  });

  router.post('/bookings/:id/status', (req, res) => {
    const status = req.body && req.body.status;
    res.json({ booking: bookings.changeStatus(db, parseId(req.params.id), status, ctx()) });
  });

  router.get('/games', (_req, res) => res.json({ games: games.listAdminGames(db, ctx()) }));

  router.post('/games', (req, res) => {
    const { data, errors } = validateGame(req.body);
    if (errors) throw new HttpError(422, 'Please fix the errors below.', { fields: errors });
    res.status(201).json({ game: games.createGame(db, data) });
  });

  router.put('/games/:id', (req, res) => {
    const { data, errors } = validateGame(req.body);
    if (errors) throw new HttpError(422, 'Please fix the errors below.', { fields: errors });
    res.json({ game: games.updateGame(db, parseId(req.params.id), data) });
  });

  router.get('/rentals', (_req, res) => res.json({ rentals: listRentals(db, ctx()) }));

  router.get('/areas', (_req, res) => res.json({ areas: settings.listAreas(db) }));

  router.get('/settings', (_req, res) => res.json(settings.getSettings(db)));

  router.put('/settings', (req, res) => {
    const areaIds = settings.listAreas(db).map((a) => a.id);
    const { data, errors } = validateSettings(req.body, areaIds);
    if (errors) throw new HttpError(422, 'Please fix the errors below.', { fields: errors });
    settings.saveSettings(db, data);
    res.json(settings.getSettings(db));
  });

  return router;
}

module.exports = { adminRoutes };
