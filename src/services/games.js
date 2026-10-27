// Game catalogue: public listing (with availability), admin listing and create/update.
const { HttpError } = require('../lib/util');
const { checkAvailability } = require('./inventory');
const { getBufferDays } = require('./settings');

function serializeGame(g) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    playersMin: g.players_min,
    playersMax: g.players_max,
    playTimeMin: g.play_time_min,
    ageMin: g.age_min,
    difficulty: g.difficulty,
    pricePerDay: g.price_per_day,
    deposit: g.deposit,
    copiesOwned: g.copies_owned,
    active: g.active === 1,
    emoji: g.emoji,
    color: g.color,
  };
}

/** Active games for the public site, each with availability from today for a 1-day rental. */
function listPublicGames(db, ctx) {
  const games = db.prepare('SELECT * FROM games WHERE active = 1 ORDER BY name').all();
  const ids = games.map((g) => g.id);
  const avail = new Map(
    checkAvailability(
      db,
      { gameIds: ids, start: ctx.today, days: 1 },
      { bufferDays: getBufferDays(db), today: ctx.today, now: ctx.now, holdHours: ctx.holdHours },
    ).map((a) => [a.gameId, a]),
  );
  return games.map((g) => {
    const a = avail.get(g.id);
    return {
      ...serializeGame(g),
      availableNow: a.available,
      nextAvailableStart: a.nextAvailableStart,
    };
  });
}

/** Admin list: every game with its live status and upcoming bookings. */
function listAdminGames(db, ctx) {
  const games = db.prepare('SELECT * FROM games ORDER BY active DESC, name').all();
  const outNow = db.prepare(
    `SELECT bi.game_id AS id, COUNT(*) AS n FROM booking_items bi
     JOIN bookings b ON b.id = bi.booking_id WHERE b.status = 'Delivered' GROUP BY bi.game_id`,
  );
  const out = new Map(outNow.all().map((r) => [r.id, r.n]));
  const upcomingStmt = db.prepare(
    `SELECT b.id, b.code, b.customer_name, b.start_date, b.return_date, b.status
     FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
     WHERE bi.game_id = ? AND b.status IN ('Pending','Confirmed','Delivered') AND b.return_date >= ?
     ORDER BY b.start_date LIMIT 5`,
  );
  return games.map((g) => {
    const copiesOut = out.get(g.id) || 0;
    let status = 'Available';
    if (!g.active) status = 'Inactive';
    else if (copiesOut >= g.copies_owned) status = 'Rented out';
    return {
      ...serializeGame(g),
      status,
      copiesOut,
      upcoming: upcomingStmt.all(g.id, ctx.today).map((u) => ({
        id: u.id,
        code: u.code,
        customerName: u.customer_name,
        startDate: u.start_date,
        returnDate: u.return_date,
        status: u.status,
      })),
    };
  });
}

function createGame(db, d) {
  // Cycle through the six tile colours so neighbouring cards differ.
  const color = (db.prepare('SELECT COUNT(*) AS n FROM games').get().n % 6) + 1;
  const result = db
    .prepare(
      `INSERT INTO games (name, description, players_min, players_max, play_time_min, age_min,
         difficulty, price_per_day, deposit, copies_owned, active, emoji, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.name,
      d.description,
      d.playersMin,
      d.playersMax,
      d.playTimeMin,
      d.ageMin,
      d.difficulty,
      d.pricePerDay,
      d.deposit,
      d.copiesOwned,
      d.active ? 1 : 0,
      d.emoji,
      color,
    );
  return getGame(db, Number(result.lastInsertRowid));
}

function updateGame(db, id, d) {
  const result = db
    .prepare(
      `UPDATE games SET name = ?, description = ?, players_min = ?, players_max = ?,
         play_time_min = ?, age_min = ?, difficulty = ?, price_per_day = ?, deposit = ?,
         copies_owned = ?, active = ?, emoji = ? WHERE id = ?`,
    )
    .run(
      d.name,
      d.description,
      d.playersMin,
      d.playersMax,
      d.playTimeMin,
      d.ageMin,
      d.difficulty,
      d.pricePerDay,
      d.deposit,
      d.copiesOwned,
      d.active ? 1 : 0,
      d.emoji,
      id,
    );
  if (result.changes === 0) throw new HttpError(404, 'Game not found.');
  return getGame(db, id);
}

function getGame(db, id) {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  return g ? serializeGame(g) : null;
}

module.exports = { listPublicGames, listAdminGames, createGame, updateGame, getGame };
