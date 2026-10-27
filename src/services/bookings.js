// Booking creation, lookup, listing and status transitions.
const { HttpError } = require('../lib/util');
const { validateBooking } = require('./validation');
const { checkAvailability } = require('./inventory');
const { computePricing } = require('./pricing');
const { getBufferDays } = require('./settings');

// Allowed status changes. Returned and Cancelled are terminal.
const TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Delivered', 'Cancelled'],
  Delivered: ['Returned'],
  Returned: [],
  Cancelled: [],
};
const STATUSES = Object.keys(TRANSITIONS);

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

/** Build the inventory context (buffer, clock, hold period) for one request. */
function inventoryContext(db, ctx, extra = {}) {
  return {
    bufferDays: getBufferDays(db),
    today: ctx.today,
    now: ctx.now,
    holdHours: ctx.holdHours,
    ...extra,
  };
}

function serializeBooking(row, items, ctx) {
  const holdMs = ctx.holdHours * 3_600_000;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    customerName: row.customer_name,
    phone: row.phone,
    areaId: row.area_id,
    area: row.area_name,
    address: { flat: row.address_flat, street: row.address_street, landmark: row.address_landmark },
    notes: row.notes,
    startDate: row.start_date,
    days: row.days,
    returnDate: row.return_date,
    rentalAmount: row.rental_amount,
    deliveryFee: row.delivery_fee,
    depositTotal: row.deposit_total,
    totalPayable: row.total_payable,
    totalCollect: row.total_payable + row.deposit_total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // A Pending request stops holding inventory after the hold period (it stays Pending).
    holdExpired: row.status === 'Pending' && ctx.now - Date.parse(row.created_at) > holdMs,
    items: items.map((i) => ({
      gameId: i.game_id,
      name: i.game_name,
      pricePerDay: i.price_per_day,
      deposit: i.deposit,
    })),
  };
}

function getBookingById(db, id, ctx) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM booking_items WHERE booking_id = ? ORDER BY id').all(id);
  return serializeBooking(row, items, ctx);
}

/**
 * Validate and save a public booking request. The availability check and the insert run in one
 * immediate transaction so two simultaneous requests cannot both take the last copy.
 */
function createBooking(db, input, ctx) {
  const { data, errors } = validateBooking(input, { today: ctx.today });
  if (errors) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });

  const run = db.transaction(() => {
    const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(data.areaId);
    if (!area)
      throw new HttpError(422, 'Please fix the highlighted fields.', {
        fields: { areaId: 'Please choose one of our delivery areas.' },
      });

    const games = data.gameIds.map((id) =>
      db.prepare('SELECT * FROM games WHERE id = ? AND active = 1').get(id),
    );
    if (games.some((g) => !g))
      throw new HttpError(422, 'Please fix the highlighted fields.', {
        fields: { games: 'One of the selected games is no longer available. Please remove it.' },
      });

    const availability = checkAvailability(
      db,
      { gameIds: data.gameIds, start: data.startDate, days: data.days },
      inventoryContext(db, ctx),
    );
    const unavailable = availability.filter((a) => !a.available);
    if (unavailable.length)
      throw new HttpError(409, 'Some games are not available for those dates.', { unavailable });

    const pricing = computePricing({
      games: games.map((g) => ({ pricePerDay: g.price_per_day, deposit: g.deposit })),
      days: data.days,
      deliveryFee: area.delivery_fee,
    });

    const createdAt = new Date(ctx.now).toISOString();
    const result = db
      .prepare(
        `INSERT INTO bookings (code, customer_name, phone, area_id, area_name, address_flat,
           address_street, address_landmark, notes, start_date, days, return_date, rental_amount,
           delivery_fee, deposit_total, total_payable, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
      )
      .run(
        `TMP-${Math.random().toString(36).slice(2)}`,
        data.name,
        data.phone,
        area.id,
        area.name,
        data.flat,
        data.street,
        data.landmark,
        data.notes,
        data.startDate,
        data.days,
        data.returnDate,
        pricing.rental,
        pricing.deliveryFee,
        pricing.deposit,
        pricing.payable,
        createdAt,
        createdAt,
      );
    const id = Number(result.lastInsertRowid);
    db.prepare('UPDATE bookings SET code = ? WHERE id = ?').run(
      `BGR-${String(id).padStart(5, '0')}`,
      id,
    );
    const addItem = db.prepare(
      'INSERT INTO booking_items (booking_id, game_id, game_name, price_per_day, deposit) VALUES (?, ?, ?, ?, ?)',
    );
    for (const g of games) addItem.run(id, g.id, g.name, g.price_per_day, g.deposit);
    return id;
  });

  return getBookingById(db, run.immediate(), ctx);
}

/**
 * Move a booking to a new status. Enforces the transition rules and, when a booking becomes
 * Confirmed or Delivered, re-checks inventory against all other active bookings.
 */
function changeStatus(db, id, newStatus, ctx) {
  if (!STATUSES.includes(newStatus)) throw new HttpError(422, 'Unknown status.');

  const run = db.transaction(() => {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (!canTransition(row.status, newStatus))
      throw new HttpError(409, `A ${row.status} booking cannot be changed to ${newStatus}.`);

    if (newStatus === 'Confirmed' || newStatus === 'Delivered') {
      const gameIds = db
        .prepare('SELECT game_id FROM booking_items WHERE booking_id = ?')
        .all(id)
        .map((r) => r.game_id);
      const result = checkAvailability(
        db,
        { gameIds, start: row.start_date, days: row.days },
        inventoryContext(db, ctx, { excludeBookingId: id }),
      );
      const blocked = result.filter((a) => !a.available);
      if (blocked.length) {
        const names = blocked.map((a) => a.name).join(', ');
        throw new HttpError(
          409,
          `Not enough copies available for ${names} on those dates. Another booking overlaps.`,
          { unavailable: blocked },
        );
      }
    }

    db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run(
      newStatus,
      new Date(ctx.now).toISOString(),
      id,
    );
  });
  run.immediate();
  return getBookingById(db, id, ctx);
}

const SORT_COLUMNS = {
  code: 'b.id',
  customer: 'b.customer_name',
  startDate: 'b.start_date',
  returnDate: 'b.return_date',
  area: 'b.area_name',
  total: '(b.total_payable + b.deposit_total)',
  status: 'b.status',
  createdAt: 'b.created_at',
};

const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Admin bookings list with search, filters, sorting and pagination. */
function listBookings(db, query, ctx) {
  const where = [];
  const params = [];

  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push(
      "(b.code LIKE ? ESCAPE '\\' OR b.customer_name LIKE ? ESCAPE '\\' OR b.phone LIKE ? ESCAPE '\\')",
    );
    params.push(like, like, like);
  }
  if (STATUSES.includes(query.status)) {
    where.push('b.status = ?');
    params.push(query.status);
  }
  if (typeof query.area === 'string' && /^\d+$/.test(query.area)) {
    where.push('b.area_id = ?');
    params.push(Number(query.area));
  }
  if (typeof query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
    where.push('b.start_date >= ?');
    params.push(query.from);
  }
  if (typeof query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    where.push('b.start_date <= ?');
    params.push(query.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortCol = SORT_COLUMNS[query.sort] || SORT_COLUMNS.createdAt;
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 10, 1), 50);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM bookings b ${whereSql}`).get(...params).n;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), pages);

  const rows = db
    .prepare(
      `SELECT b.*, (SELECT group_concat(game_name, ', ') FROM booking_items WHERE booking_id = b.id) AS games
       FROM bookings b ${whereSql}
       ORDER BY ${sortCol} ${dir}, b.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  const holdMs = ctx.holdHours * 3_600_000;
  return {
    page,
    pages,
    pageSize,
    total,
    items: rows.map((r) => ({
      id: r.id,
      code: r.code,
      customerName: r.customer_name,
      phone: r.phone,
      games: r.games,
      startDate: r.start_date,
      returnDate: r.return_date,
      area: r.area_name,
      total: r.total_payable + r.deposit_total,
      status: r.status,
      createdAt: r.created_at,
      holdExpired: r.status === 'Pending' && ctx.now - Date.parse(r.created_at) > holdMs,
    })),
  };
}

/** Days overdue / due state for a Delivered booking, relative to today. */
function dueState(returnDate, today) {
  if (returnDate < today) return 'overdue';
  if (returnDate === today) return 'today';
  return 'upcoming';
}

module.exports = {
  TRANSITIONS,
  STATUSES,
  canTransition,
  createBooking,
  changeStatus,
  getBookingById,
  listBookings,
  dueState,
};
