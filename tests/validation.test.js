const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBooking,
  normalizePhone,
  validateGame,
  validateUsername,
  validatePassword,
} = require('../src/services/validation');
const { bookingBody } = require('./helpers');

const TODAY = '2026-03-10';
const check = (overrides) => validateBooking(bookingBody([1], overrides), { today: TODAY });

test('a valid booking passes and derives the return date', () => {
  const { data, errors } = check({});
  assert.equal(errors, null);
  assert.equal(data.returnDate, '2026-03-13'); // 2 days starting 12th -> last day is the 13th
  assert.equal(data.phone, '9845012345');
});

test('indian mobile numbers are normalised and invalid ones rejected', () => {
  assert.equal(normalizePhone('+91 98450 12345'), '9845012345');
  assert.equal(normalizePhone('09845012345'), '9845012345');
  assert.equal(normalizePhone('919845012345'), '9845012345');
  for (const bad of ['12345', '5845012345', '98450123456789', 'abcdefghij', '']) {
    assert.equal(normalizePhone(bad), null, bad);
    assert.ok(check({ phone: bad }).errors.phone, `phone ${bad} should error`);
  }
});

test('start date must be a real date and not in the past', () => {
  assert.equal(check({ startDate: TODAY }).errors, null); // today is allowed
  assert.match(check({ startDate: '2026-03-09' }).errors.startDate, /past/);
  assert.match(check({ startDate: '2026-02-30' }).errors.startDate, /valid/);
  assert.match(check({ startDate: '' }).errors.startDate, /choose/);
});

test('days must be a whole number from 1 to 7', () => {
  assert.equal(check({ days: 1 }).errors, null);
  assert.equal(check({ days: 7 }).errors, null);
  for (const bad of [0, 8, -1, 1.5, 'x', null])
    assert.ok(check({ days: bad }).errors.days, String(bad));
});

test('games, area, address and name are required with clear messages', () => {
  assert.ok(validateBooking(bookingBody([]), { today: TODAY }).errors.games);
  assert.ok(validateBooking(bookingBody(['abc']), { today: TODAY }).errors.games);
  const e = check({ areaId: '', flat: ' ', street: '', landmark: '', name: '' }).errors;
  assert.ok(e.areaId && e.flat && e.street && e.landmark && e.name);
  assert.ok(check({ name: 'Bob<script>' }).errors.name);
});

test('duplicate games are merged and notes are length limited', () => {
  const { data } = validateBooking(bookingBody([1, 1, 2]), { today: TODAY });
  assert.deepEqual(data.gameIds, [1, 2]);
  assert.ok(check({ notes: 'x'.repeat(501) }).errors.notes);
});

test('control characters are stripped and whitespace collapsed', () => {
  const { data } = check({ flat: '  Flat \u0007 12   B  ' });
  assert.equal(data.flat, 'Flat 12 B');
});

test('game validation: non-negative money and whole copies of at least 1', () => {
  const ok = {
    name: 'G',
    playersMin: 2,
    playersMax: 4,
    playTimeMin: 20,
    ageMin: 8,
    difficulty: 'Easy',
    pricePerDay: 0,
    deposit: 0,
    copiesOwned: 1,
  };
  assert.equal(validateGame(ok).errors, null);
  assert.ok(validateGame({ ...ok, pricePerDay: -1 }).errors.pricePerDay);
  assert.ok(validateGame({ ...ok, deposit: -5 }).errors.deposit);
  assert.ok(validateGame({ ...ok, copiesOwned: 0 }).errors.copiesOwned);
  assert.ok(validateGame({ ...ok, copiesOwned: 1.5 }).errors.copiesOwned);
  assert.equal(validateGame({ ...ok, copiesOwned: undefined }).data.copiesOwned, 1); // defaults to 1
  assert.ok(validateGame({ ...ok, difficulty: 'Brutal' }).errors.difficulty);
});

test('username and password rules', () => {
  assert.equal(validateUsername('owner_1'), null);
  for (const bad of ['ab', 'a'.repeat(21), 'has space', 'bad-char!'])
    assert.ok(validateUsername(bad), bad);
  assert.equal(validatePassword('12345678'), null);
  assert.ok(validatePassword('1234567'));
});
