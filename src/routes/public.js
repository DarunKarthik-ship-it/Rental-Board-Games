// Public (customer) API. No authentication: customers can only read catalogue data and submit
// a booking request.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('../lib/util');
const { validateAvailabilityQuery, MAX_DAYS } = require('../services/validation');
const { checkAvailability } = require('../services/inventory');
const { listPublicGames } = require('../services/games');
const { createBooking } = require('../services/bookings');
const { getSettings, getSetting, getBufferDays } = require('../services/settings');
const { adminBookingUrl } = require('../services/whatsapp');

function publicRoutes({ db, ctx, limits }) {
  const router = express.Router();

  const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limits.booking,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many booking requests from this device. Please try again later.' },
  });

  const availabilityLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: limits.availability,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many availability checks. Please wait a moment.' },
  });

  // Business info, delivery areas and rules the booking form needs.
  router.get('/config', (_req, res) => {
    const s = getSettings(db);
    res.json({
      businessName: s.businessName,
      bufferDays: s.bufferDays,
      areas: s.areas,
      maxDays: MAX_DAYS,
      today: ctx().today,
    });
  });

  router.get('/games', (_req, res) => {
    res.json({ games: listPublicGames(db, ctx()) });
  });

  // Which of the chosen games are free for the requested dates, with next available start date.
  router.post('/availability', availabilityLimiter, (req, res) => {
    const c = ctx();
    const { data, errors } = validateAvailabilityQuery(req.body, { today: c.today });
    if (errors) throw new HttpError(422, 'Please check the dates and games.', { fields: errors });
    const activeIds = new Set(
      db
        .prepare('SELECT id FROM games WHERE active = 1')
        .all()
        .map((g) => g.id),
    );
    const known = data.gameIds.filter((id) => activeIds.has(id));
    const results = checkAvailability(
      db,
      { gameIds: known, start: data.startDate, days: data.days },
      { bufferDays: getBufferDays(db), today: c.today, now: c.now, holdHours: c.holdHours },
    );
    res.json({ results });
  });

  router.post('/bookings', bookingLimiter, (req, res) => {
    const booking = createBooking(db, req.body, ctx());
    res.status(201).json({
      booking,
      // The confirmation page opens this link so the customer can send the details to the owner.
      whatsappUrl: adminBookingUrl(booking, getSetting(db, 'admin_whatsapp')),
    });
  });

  return router;
}

module.exports = { publicRoutes };
