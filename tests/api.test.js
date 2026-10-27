const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
  canTransition,
  TRANSITIONS,
  changeStatus,
  createBooking,
} = require('../src/services/bookings');
const { openDatabase } = require('../src/db');
const { makeApp, addGame, bookingBody, signupOwner } = require('./helpers');

test('status transition matrix', () => {
  const statuses = Object.keys(TRANSITIONS);
  const allowed = new Set([
    'Pending>Confirmed',
    'Pending>Cancelled',
    'Confirmed>Delivered',
    'Confirmed>Cancelled',
    'Delivered>Returned',
  ]);
  for (const from of statuses)
    for (const to of statuses)
      assert.equal(canTransition(from, to), allowed.has(`${from}>${to}`), `${from} -> ${to}`);
});

test('invalid transitions are blocked on the server', () => {
  const { db, ctx } = makeApp();
  const g = addGame(db);
  const b = createBooking(db, bookingBody([g]), ctx());
  for (const bad of ['Delivered', 'Returned', 'Pending'])
    assert.throws(
      () => changeStatus(db, b.id, bad, ctx()),
      (e) => e.status === 409,
      bad,
    );
  assert.throws(
    () => changeStatus(db, b.id, 'Nonsense', ctx()),
    (e) => e.status === 422,
  );
  assert.throws(
    () => changeStatus(db, 9999, 'Confirmed', ctx()),
    (e) => e.status === 404,
  );
  changeStatus(db, b.id, 'Cancelled', ctx());
  assert.throws(
    () => changeStatus(db, b.id, 'Confirmed', ctx()),
    (e) => e.status === 409,
  ); // terminal
});

test('a delivered booking cannot be cancelled', () => {
  const { db, ctx } = makeApp();
  const g = addGame(db);
  const b = createBooking(db, bookingBody([g]), ctx());
  changeStatus(db, b.id, 'Confirmed', ctx());
  changeStatus(db, b.id, 'Delivered', ctx());
  assert.throws(
    () => changeStatus(db, b.id, 'Cancelled', ctx()),
    (e) => e.status === 409,
  );
});

test('public booking flow over HTTP: success, field errors and conflicts', async () => {
  const { app, db } = makeApp();
  const g = addGame(db, { name: 'Camel Up' });

  const bad = await request(app)
    .post('/api/public/bookings')
    .send(bookingBody([g], { phone: '123', days: 9 }));
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fields.phone && bad.body.fields.days);

  const ok = await request(app)
    .post('/api/public/bookings')
    .send(bookingBody([g]));
  assert.equal(ok.status, 201);
  assert.match(ok.body.booking.code, /^BGR-\d{5}$/);
  assert.equal(ok.body.booking.status, 'Pending');
  assert.ok(ok.body.whatsappUrl.startsWith('https://wa.me/919999999999?text='));
  assert.ok(decodeURIComponent(ok.body.whatsappUrl).includes(ok.body.booking.code));

  const conflict = await request(app)
    .post('/api/public/bookings')
    .send(bookingBody([g]));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.unavailable[0].nextAvailableStart, '2026-03-15');

  const bad2 = await request(app)
    .post('/api/public/bookings')
    .set('Content-Type', 'application/json')
    .send('{broken');
  assert.equal(bad2.status, 400);
});

test('availability endpoint reports next available start date', async () => {
  const { app, db } = makeApp();
  const g = addGame(db);
  await request(app)
    .post('/api/public/bookings')
    .send(bookingBody([g]));
  const res = await request(app)
    .post('/api/public/availability')
    .send({ gameIds: [g], startDate: '2026-03-12', days: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.results[0].available, false);
  assert.equal(res.body.results[0].nextAvailableStart, '2026-03-15');
  const past = await request(app)
    .post('/api/public/availability')
    .send({ gameIds: [g], startDate: '2026-03-01', days: 1 });
  assert.equal(past.status, 422);
});

test('deactivated games disappear from the public site but stay in past bookings', async () => {
  const { app, db } = makeApp();
  const g = addGame(db, { name: 'Wingspan' });
  const { agent, csrf } = await signupOwner(app);
  const created = await request(app)
    .post('/api/public/bookings')
    .send(bookingBody([g]));
  assert.equal(created.status, 201);

  const list = await agent.get('/api/admin/games');
  const game = list.body.games.find((x) => x.id === g);
  const { status, copiesOut, upcoming, ...rest } = game; // eslint-disable-line no-unused-vars
  const off = await agent
    .put(`/api/admin/games/${g}`)
    .set('X-CSRF-Token', csrf)
    .send({ ...rest, active: false });
  assert.equal(off.status, 200);

  const pub = await request(app).get('/api/public/games');
  assert.equal(
    pub.body.games.find((x) => x.id === g),
    undefined,
  );
  const detail = await agent.get(`/api/admin/bookings/${created.body.booking.id}`);
  assert.equal(detail.body.booking.items[0].name, 'Wingspan');
  const again = await agent.get('/api/admin/games');
  assert.equal(again.body.games.find((x) => x.id === g).status, 'Inactive');
});

test('admin game validation and settings changes reach the public site immediately', async () => {
  const { app } = makeApp();
  const { agent, csrf } = await signupOwner(app);
  const badGame = await agent.post('/api/admin/games').set('X-CSRF-Token', csrf).send({
    name: 'X',
    playersMin: 2,
    playersMax: 4,
    playTimeMin: 10,
    ageMin: 8,
    difficulty: 'Easy',
    pricePerDay: -5,
    deposit: 100,
    copiesOwned: 0,
  });
  assert.equal(badGame.status, 422);
  assert.ok(badGame.body.fields.pricePerDay && badGame.body.fields.copiesOwned);

  const current = (await agent.get('/api/admin/settings')).body;
  assert.equal(current.bufferDays, 1);
  const badWa = await agent
    .put('/api/admin/settings')
    .set('X-CSRF-Token', csrf)
    .send({ ...current, adminWhatsapp: '12345' });
  assert.equal(badWa.status, 422);
  assert.ok(badWa.body.fields.adminWhatsapp);

  const areas = current.areas.map((a, i) =>
    i === 0 ? { ...a, deliveryFee: 99, timeNote: 'Within 1 hour' } : a,
  );
  const saved = await agent
    .put('/api/admin/settings')
    .set('X-CSRF-Token', csrf)
    .send({ adminWhatsapp: '919812345678', bufferDays: 2, areas });
  assert.equal(saved.status, 200);

  const pub = await request(app).get('/api/public/config');
  assert.equal(pub.body.bufferDays, 2);
  assert.equal(pub.body.areas[0].deliveryFee, 99);
  assert.equal(pub.body.areas[0].timeNote, 'Within 1 hour');
  assert.equal(pub.body.areas.length, 4);
});

test('data persists across a database reopen (real SQLite file)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bgr-'));
  const file = path.join(dir, 'test.sqlite');
  try {
    const first = openDatabase(file);
    const gameId = addGame(first);
    const ctx = { now: Date.parse('2026-03-10T06:00:00Z'), today: '2026-03-10', holdHours: 24 };
    const booking = createBooking(first, bookingBody([gameId]), ctx);
    first.close();

    const second = openDatabase(file); // also proves migrations are safe to re-run
    const row = second
      .prepare('SELECT code, customer_name FROM bookings WHERE id = ?')
      .get(booking.id);
    assert.equal(row.code, booking.code);
    assert.equal(row.customer_name, 'Asha Rao');
    assert.equal(second.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 2);
    second.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dashboard and rentals reflect delivered, due-today and overdue bookings', async () => {
  const { app, db, ctx, clock } = makeApp();
  const g1 = addGame(db);
  const g2 = addGame(db);
  const { agent } = await signupOwner(app);
  const overdue = createBooking(db, bookingBody([g1], { startDate: '2026-03-10', days: 1 }), ctx());
  changeStatus(db, overdue.id, 'Confirmed', ctx());
  changeStatus(db, overdue.id, 'Delivered', ctx());
  const today = createBooking(db, bookingBody([g2], { startDate: '2026-03-10', days: 2 }), ctx());
  changeStatus(db, today.id, 'Confirmed', ctx());
  changeStatus(db, today.id, 'Delivered', ctx());

  clock.now += 86_400_000; // now 11 Mar: first was due 10th (overdue), second due 11th (today)
  const dash = (await agent.get('/api/admin/dashboard')).body;
  assert.equal(dash.cards.activeRentals, 2);
  assert.equal(dash.cards.overdue, 1);
  assert.equal(dash.cards.dueToday, 1);
  assert.equal(dash.weeks.length, 8);
  const rentals = (await agent.get('/api/admin/rentals')).body.rentals;
  assert.deepEqual(
    rentals.map((r) => r.due),
    ['overdue', 'today'],
  );
});

test('bookings list supports search, filters and pagination', async () => {
  const { app, db, ctx } = makeApp();
  const { agent } = await signupOwner(app);
  const g = addGame(db, { copies_owned: 30 });
  for (let i = 0; i < 12; i++)
    createBooking(
      db,
      bookingBody([g], {
        name: i === 0 ? 'Zed Unique' : 'Asha Rao',
        phone: i === 0 ? '9000000001' : '9845012345',
        areaId: (i % 2) + 1,
      }),
      ctx(),
    );
  const all = (await agent.get('/api/admin/bookings?pageSize=5&page=3')).body;
  assert.equal(all.total, 12);
  assert.equal(all.items.length, 2);
  assert.equal((await agent.get('/api/admin/bookings?q=Zed')).body.total, 1);
  assert.equal((await agent.get('/api/admin/bookings?q=9000000001')).body.total, 1);
  assert.equal((await agent.get('/api/admin/bookings?q=BGR-00001')).body.total, 1);
  assert.equal((await agent.get('/api/admin/bookings?area=1')).body.total, 6);
  assert.equal((await agent.get('/api/admin/bookings?status=Confirmed')).body.total, 0);
  assert.equal((await agent.get('/api/admin/bookings?q=%25')).body.total, 0); // % is not a wildcard
  assert.equal((await agent.get('/api/admin/bookings?from=2026-03-13')).body.total, 0);
});
