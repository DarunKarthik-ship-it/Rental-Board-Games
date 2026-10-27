// Shared test helpers: an isolated app with an in-memory database and a controllable clock.
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { load } = require('../src/config');
const { todayIST } = require('../src/lib/dates');

// 2026-03-10 11:30 in India
const START_TIME = Date.parse('2026-03-10T06:00:00Z');
const silent = { info() {}, warn() {}, error() {} };

function makeApp({ now = START_TIME } = {}) {
  const db = openDatabase(':memory:');
  const clock = { now };
  const config = load({ NODE_ENV: 'test', SESSION_SECRET: 'test-secret' });
  const app = createApp({
    db,
    config,
    clock: () => clock.now,
    limits: { auth: 1000, booking: 1000 },
    logger: silent,
  });
  const ctx = () => ({
    now: clock.now,
    today: todayIST(clock.now),
    holdHours: config.pendingHoldHours,
  });
  return { db, app, clock, ctx };
}

let gameCounter = 0;
function addGame(db, overrides = {}) {
  gameCounter += 1;
  const g = {
    name: `Test Game ${gameCounter}`,
    description: 'A game',
    players_min: 2,
    players_max: 4,
    play_time_min: 30,
    age_min: 8,
    difficulty: 'Easy',
    price_per_day: 100,
    deposit: 500,
    copies_owned: 1,
    active: 1,
    ...overrides,
  };
  const r = db
    .prepare(
      `INSERT INTO games (name, description, players_min, players_max, play_time_min, age_min,
         difficulty, price_per_day, deposit, copies_owned, active)
       VALUES (@name, @description, @players_min, @players_max, @play_time_min, @age_min,
         @difficulty, @price_per_day, @deposit, @copies_owned, @active)`,
    )
    .run(g);
  return Number(r.lastInsertRowid);
}

function bookingBody(gameIds, overrides = {}) {
  return {
    gameIds,
    startDate: '2026-03-12',
    days: 2,
    areaId: 1,
    flat: 'Flat 402, Tower B',
    street: '3rd Cross, Outer Ring Road',
    landmark: 'Near Decathlon',
    name: 'Asha Rao',
    phone: '9845012345',
    notes: '',
    ...overrides,
  };
}

/** Agent with a session cookie and CSRF token ready for state-changing admin requests. */
async function csrfAgent(app) {
  const agent = request.agent(app);
  const res = await agent.get('/api/admin/session');
  return { agent, csrf: res.body.csrfToken };
}

async function signupOwner(app, username = 'owner_1', password = 'correct horse') {
  const { agent, csrf } = await csrfAgent(app);
  const res = await agent
    .post('/api/admin/signup')
    .set('X-CSRF-Token', csrf)
    .send({ username, password, confirmPassword: password });
  return { agent, csrf: res.body.csrfToken, res };
}

module.exports = { makeApp, addGame, bookingBody, csrfAgent, signupOwner, START_TIME };
