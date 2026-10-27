const test = require('node:test');
const assert = require('node:assert/strict');
const { isAvailable, nextAvailableStart, occupiedWindow } = require('../src/services/inventory');
const { createBooking, changeStatus } = require('../src/services/bookings');
const { HttpError } = require('../src/lib/util');
const { makeApp, addGame, bookingBody } = require('./helpers');

test('occupied window = rental days plus buffer days', () => {
  assert.deepEqual(occupiedWindow('2026-03-12', 2, 1), { start: '2026-03-12', end: '2026-03-14' });
  assert.deepEqual(occupiedWindow('2026-03-12', 1, 0), { start: '2026-03-12', end: '2026-03-12' });
});

test('isAvailable counts overlaps per day against copies owned', () => {
  const holds = [{ start: '2026-03-12', end: '2026-03-14' }];
  assert.equal(isAvailable({ copies: 1, holds, start: '2026-03-14', end: '2026-03-15' }), false);
  assert.equal(isAvailable({ copies: 1, holds, start: '2026-03-15', end: '2026-03-16' }), true);
  assert.equal(isAvailable({ copies: 2, holds, start: '2026-03-12', end: '2026-03-13' }), true);
  const two = [...holds, { start: '2026-03-13', end: '2026-03-15' }];
  assert.equal(
    isAvailable({ copies: 2, holds: two, start: '2026-03-13', end: '2026-03-14' }),
    false,
  );
});

test('next available start skips past the buffer', () => {
  const holds = [{ start: '2026-03-12', end: '2026-03-14' }];
  const next = nextAvailableStart({
    copies: 1,
    holds,
    start: '2026-03-12',
    days: 1,
    bufferDays: 1,
  });
  assert.equal(next, '2026-03-15');
});

function expectConflict(fn) {
  assert.throws(
    fn,
    (err) => err instanceof HttpError && err.status === 409 && Boolean(err.details.unavailable),
  );
}

test('buffer days block the next rental, and the next available date is reported', () => {
  const { db, ctx } = makeApp();
  const g = addGame(db);
  createBooking(db, bookingBody([g]), ctx()); // 12th-13th, buffer holds the 14th
  expectConflict(() => createBooking(db, bookingBody([g], { startDate: '2026-03-14' }), ctx()));
  try {
    createBooking(db, bookingBody([g], { startDate: '2026-03-12' }), ctx());
  } catch (err) {
    assert.equal(err.details.unavailable[0].nextAvailableStart, '2026-03-15');
  }
  assert.ok(createBooking(db, bookingBody([g], { startDate: '2026-03-15' }), ctx()).code);
});

test('copies owned allows that many overlapping bookings', () => {
  const { db, ctx } = makeApp();
  const g = addGame(db, { copies_owned: 2 });
  createBooking(db, bookingBody([g]), ctx());
  createBooking(db, bookingBody([g]), ctx());
  expectConflict(() => createBooking(db, bookingBody([g]), ctx()));
});

test('a multi-game booking is rejected if any one game is unavailable', () => {
  const { db, ctx } = makeApp();
  const a = addGame(db);
  const b = addGame(db);
  createBooking(db, bookingBody([a]), ctx());
  assert.throws(
    () => createBooking(db, bookingBody([a, b]), ctx()),
    (e) => e.status === 409 && e.details.unavailable.length === 1,
  );
});

test('cancelled and returned bookings do not block inventory', () => {
  const { db, ctx } = makeApp();
  const g = addGame(db);
  const first = createBooking(db, bookingBody([g]), ctx());
  changeStatus(db, first.id, 'Cancelled', ctx());
  const second = createBooking(db, bookingBody([g]), ctx());
  changeStatus(db, second.id, 'Confirmed', ctx());
  changeStatus(db, second.id, 'Delivered', ctx());
  expectConflict(() => createBooking(db, bookingBody([g]), ctx())); // delivered still blocks
  changeStatus(db, second.id, 'Returned', ctx());
  assert.ok(createBooking(db, bookingBody([g]), ctx()).code);
});

test('a pending request stops holding inventory after the hold period', () => {
  const { db, ctx, clock } = makeApp();
  const g = addGame(db);
  createBooking(db, bookingBody([g]), ctx());
  clock.now += 25 * 3_600_000;
  const b = createBooking(db, bookingBody([g]), ctx());
  assert.ok(b.code);
});

test('admin confirmation re-checks inventory, so an expired hold cannot double-book', () => {
  const { db, ctx, clock } = makeApp();
  const g = addGame(db);
  const a = createBooking(db, bookingBody([g]), ctx());
  clock.now += 25 * 3_600_000; // a's hold expires
  const b = createBooking(db, bookingBody([g]), ctx());
  assert.throws(
    () => changeStatus(db, a.id, 'Confirmed', ctx()),
    (e) => e.status === 409,
  );
  assert.equal(changeStatus(db, b.id, 'Confirmed', ctx()).status, 'Confirmed');
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(a.id).status, 'Pending');
});

test('an overdue delivered booking keeps blocking until it is returned', () => {
  const { db, ctx, clock } = makeApp();
  const g = addGame(db);
  const a = createBooking(db, bookingBody([g], { startDate: '2026-03-10', days: 1 }), ctx());
  changeStatus(db, a.id, 'Confirmed', ctx());
  changeStatus(db, a.id, 'Delivered', ctx());
  clock.now += 10 * 86_400_000; // well past its return date
  expectConflict(() =>
    createBooking(db, bookingBody([g], { startDate: '2026-03-20', days: 1 }), ctx()),
  );
});

test('unknown or inactive games cannot be booked', () => {
  const { db, ctx } = makeApp();
  const inactive = addGame(db, { active: 0 });
  assert.throws(
    () => createBooking(db, bookingBody([inactive]), ctx()),
    (e) => e.status === 422 && Boolean(e.details.fields.games),
  );
  assert.throws(
    () => createBooking(db, bookingBody([9999]), ctx()),
    (e) => e.status === 422,
  );
});

test('prices are snapshotted: rental + delivery fee payable, deposit separate', () => {
  const { db, ctx } = makeApp();
  const g = addGame(db, { price_per_day: 150, deposit: 1500 });
  const b = createBooking(db, bookingBody([g], { days: 3, areaId: 1 }), ctx());
  assert.equal(b.rentalAmount, 450);
  assert.equal(b.deliveryFee, 50);
  assert.equal(b.totalPayable, 500);
  assert.equal(b.depositTotal, 1500);
  assert.equal(b.totalCollect, 2000);
});
