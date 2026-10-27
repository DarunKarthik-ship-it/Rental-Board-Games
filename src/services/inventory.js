// Inventory rule. A booking occupies [startDate, returnDate + bufferDays] for each game it
// contains. A game can be booked only if, on every day of the requested occupied window, the
// number of overlapping active bookings is below copies_owned.
//
// Active = Confirmed, Delivered, and Pending requests that are still within their hold period.
// Cancelled and Returned never block. A Delivered booking that is overdue keeps blocking until
// it is actually returned, because the game is physically out.
const { addDays, diffDays } = require('../lib/dates');

const NEXT_AVAILABLE_HORIZON_DAYS = 180;

/**
 * Pure check. `holds` is a list of { start, end } occupied windows (inclusive).
 * Returns true when every day in [start, end] has fewer than `copies` overlapping holds.
 */
function isAvailable({ copies, holds, start, end }) {
  const span = diffDays(start, end) + 1;
  for (let i = 0; i < span; i++) {
    const day = addDays(start, i);
    let count = 0;
    for (const h of holds) if (h.start <= day && day <= h.end) count++;
    if (count >= copies) return false;
  }
  return true;
}

/** Occupied window for a rental of `days` days starting on `start`. */
function occupiedWindow(start, days, bufferDays) {
  return { start, end: addDays(start, days - 1 + bufferDays) };
}

/** Earliest start date >= `start` where the whole rental fits, or null within the horizon. */
function nextAvailableStart({ copies, holds, start, days, bufferDays }) {
  for (let offset = 0; offset <= NEXT_AVAILABLE_HORIZON_DAYS; offset++) {
    const s = addDays(start, offset);
    const w = occupiedWindow(s, days, bufferDays);
    if (isAvailable({ copies, holds, start: w.start, end: w.end })) return s;
  }
  return null;
}

/**
 * Load occupied windows per game id from the database.
 * ctx: { bufferDays, today, now (ms), holdHours, excludeBookingId? }
 */
function loadHolds(db, gameIds, ctx) {
  const holds = new Map(gameIds.map((id) => [id, []]));
  if (gameIds.length === 0) return holds;
  const placeholders = gameIds.map(() => '?').join(',');
  const params = [...gameIds];
  let sql = `SELECT bi.game_id, b.start_date, b.return_date, b.status, b.created_at
             FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
             WHERE bi.game_id IN (${placeholders})
               AND b.status IN ('Pending','Confirmed','Delivered')`;
  if (ctx.excludeBookingId) {
    sql += ' AND b.id != ?';
    params.push(ctx.excludeBookingId);
  }
  const holdMs = ctx.holdHours * 3_600_000;
  for (const row of db.prepare(sql).all(...params)) {
    if (row.status === 'Pending' && ctx.now - Date.parse(row.created_at) > holdMs) continue;
    let end = addDays(row.return_date, ctx.bufferDays);
    if (row.status === 'Delivered') {
      const lastDay = addDays(ctx.today, ctx.bufferDays);
      if (end < lastDay) end = lastDay;
    }
    holds.get(row.game_id).push({ start: row.start_date, end });
  }
  return holds;
}

/**
 * Check every game for a requested rental.
 * Returns [{ gameId, name, available, nextAvailableStart }] in the order of gameIds.
 */
function checkAvailability(db, { gameIds, start, days }, ctx) {
  const holds = loadHolds(db, gameIds, ctx);
  const window = occupiedWindow(start, days, ctx.bufferDays);
  const getGame = db.prepare('SELECT id, name, copies_owned FROM games WHERE id = ?');
  return gameIds.map((gameId) => {
    const game = getGame.get(gameId);
    if (!game) return { gameId, name: null, available: false, nextAvailableStart: null };
    const gameHolds = holds.get(gameId);
    const available = isAvailable({
      copies: game.copies_owned,
      holds: gameHolds,
      start: window.start,
      end: window.end,
    });
    return {
      gameId,
      name: game.name,
      available,
      nextAvailableStart: available
        ? start
        : nextAvailableStart({
            copies: game.copies_owned,
            holds: gameHolds,
            start,
            days,
            bufferDays: ctx.bufferDays,
          }),
    };
  });
}

module.exports = { isAvailable, occupiedWindow, nextAvailableStart, loadHolds, checkAvailability };
