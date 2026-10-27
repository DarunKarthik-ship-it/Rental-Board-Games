// Dashboard metrics and the active-rentals list.
const { addDays, weekStart, isoToISTDate } = require('../lib/dates');
const { dueState } = require('./bookings');
const { getSetting } = require('./settings');

// Number shipped with a fresh install; customers' WhatsApp messages would go nowhere useful.
const PLACEHOLDER_WHATSAPP = '919999999999';

function dashboard(db, ctx) {
  const count = (sql, ...p) => db.prepare(sql).get(...p).n;
  const cards = {
    total: count('SELECT COUNT(*) AS n FROM bookings'),
    pending: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'Pending'"),
    activeRentals: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'Delivered'"),
    dueToday: count(
      "SELECT COUNT(*) AS n FROM bookings WHERE status = 'Delivered' AND return_date = ?",
      ctx.today,
    ),
    overdue: count(
      "SELECT COUNT(*) AS n FROM bookings WHERE status = 'Delivered' AND return_date < ?",
      ctx.today,
    ),
  };

  // Bookings per week (Monday start) for the last 8 weeks, cancelled requests excluded.
  const thisWeek = weekStart(ctx.today);
  const weeks = [];
  for (let i = 7; i >= 0; i--) weeks.push({ weekStart: addDays(thisWeek, -7 * i), count: 0 });
  const index = new Map(weeks.map((w, i) => [w.weekStart, i]));
  const since = new Date(Date.parse(`${weeks[0].weekStart}T00:00:00Z`) - 5.5 * 3_600_000);
  const rows = db
    .prepare("SELECT created_at FROM bookings WHERE status != 'Cancelled' AND created_at >= ?")
    .all(since.toISOString());
  for (const r of rows) {
    const i = index.get(weekStart(isoToISTDate(r.created_at)));
    if (i !== undefined) weeks[i].count++;
  }

  const topGames = db
    .prepare(
      `SELECT bi.game_id AS id, MAX(bi.game_name) AS name, COUNT(*) AS count
       FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
       WHERE b.status IN ('Confirmed','Delivered','Returned')
       GROUP BY bi.game_id ORDER BY count DESC, name LIMIT 6`,
    )
    .all();

  const holdMs = ctx.holdHours * 3_600_000;
  const pending = db
    .prepare(
      `SELECT id, code, customer_name, start_date, created_at FROM bookings
       WHERE status = 'Pending' ORDER BY created_at LIMIT 10`,
    )
    .all()
    .map((r) => ({
      id: r.id,
      code: r.code,
      customerName: r.customer_name,
      startDate: r.start_date,
      createdAt: r.created_at,
      holdExpired: ctx.now - Date.parse(r.created_at) > holdMs,
    }));
  const overdue = db
    .prepare(
      `SELECT id, code, customer_name, return_date, phone FROM bookings
       WHERE status = 'Delivered' AND return_date < ? ORDER BY return_date LIMIT 10`,
    )
    .all(ctx.today)
    .map((r) => ({
      id: r.id,
      code: r.code,
      customerName: r.customer_name,
      returnDate: r.return_date,
      phone: r.phone,
    }));

  return {
    cards,
    weeks,
    topGames,
    attention: { pending, overdue },
    whatsappIsPlaceholder: getSetting(db, 'admin_whatsapp') === PLACEHOLDER_WHATSAPP,
  };
}

/** Delivered bookings that have not been returned, soonest due first. */
function listRentals(db, ctx) {
  const rows = db
    .prepare(
      `SELECT b.*, (SELECT group_concat(game_name, ', ') FROM booking_items WHERE booking_id = b.id) AS games
       FROM bookings b WHERE b.status = 'Delivered' ORDER BY b.return_date, b.id`,
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    customerName: r.customer_name,
    phone: r.phone,
    area: r.area_name,
    games: r.games,
    startDate: r.start_date,
    returnDate: r.return_date,
    due: dueState(r.return_date, ctx.today),
    daysOverdue:
      r.return_date < ctx.today
        ? Math.round((Date.parse(ctx.today) - Date.parse(r.return_date)) / 86_400_000)
        : 0,
  }));
}

module.exports = { dashboard, listRentals };
