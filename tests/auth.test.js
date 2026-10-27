const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp, csrfAgent, signupOwner } = require('./helpers');

test('fresh install has no admin and signup is open', async () => {
  const { app, db } = makeApp();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 0);
  const { body } = await request(app).get('/api/admin/session');
  assert.equal(body.signupOpen, true);
  assert.equal(body.authenticated, false);
});

test('first signup becomes the owner, is logged in, and the password is hashed', async () => {
  const { app, db } = makeApp();
  const { agent, res } = await signupOwner(app);
  assert.equal(res.status, 201);
  const row = db.prepare('SELECT * FROM admins').get();
  assert.equal(row.username, 'owner_1');
  assert.ok(row.password_hash.startsWith('$2'), 'bcrypt hash');
  assert.notEqual(row.password_hash, 'correct horse');
  const session = await agent.get('/api/admin/session');
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.username, 'owner_1');
});

test('signup closes after the first admin', async () => {
  const { app, db } = makeApp();
  await signupOwner(app);
  const { agent, csrf } = await csrfAgent(app);
  const second = await agent
    .post('/api/admin/signup')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'second_user', password: 'another pass', confirmPassword: 'another pass' });
  assert.equal(second.status, 403);
  assert.equal(second.body.code, 'SIGNUP_CLOSED');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 1);
  const { body } = await request(app).get('/api/admin/session');
  assert.equal(body.signupOpen, false); // the page uses this to redirect to login
});

test('signup validates username, password length and confirmation', async () => {
  const { app } = makeApp();
  const { agent, csrf } = await csrfAgent(app);
  const post = (body) => agent.post('/api/admin/signup').set('X-CSRF-Token', csrf).send(body);
  let res = await post({ username: 'a!', password: 'short', confirmPassword: 'short' });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.username && res.body.fields.password);
  res = await post({
    username: 'valid_name',
    password: 'longenough',
    confirmPassword: 'different1',
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.confirmPassword);
});

test('login failure gives one generic message for wrong password and unknown user', async () => {
  const { app } = makeApp();
  await signupOwner(app);
  const { agent, csrf } = await csrfAgent(app);
  const wrongPass = await agent
    .post('/api/admin/login')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'owner_1', password: 'nope nope' });
  const noUser = await agent
    .post('/api/admin/login')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'ghost_user', password: 'nope nope' });
  for (const res of [wrongPass, noUser]) {
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Incorrect username or password');
  }
  const stillOut = await agent.get('/api/admin/session');
  assert.equal(stillOut.body.authenticated, false);
});

test('login with the right credentials works', async () => {
  const { app } = makeApp();
  await signupOwner(app);
  const { agent, csrf } = await csrfAgent(app);
  const res = await agent
    .post('/api/admin/login')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'OWNER_1', password: 'correct horse' });
  assert.equal(res.status, 200);
  assert.equal((await agent.get('/api/admin/dashboard')).status, 200);
});

test('unauthenticated access: admin API returns 401 and admin assets are not served', async () => {
  const { app } = makeApp();
  for (const path of [
    '/api/admin/dashboard',
    '/api/admin/bookings',
    '/api/admin/games',
    '/api/admin/rentals',
    '/api/admin/settings',
  ]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
  }
  assert.equal((await request(app).get('/admin-assets/admin.js')).status, 401);
  const { agent, csrf } = await csrfAgent(app);
  assert.equal(
    (await agent.put('/api/admin/settings').set('X-CSRF-Token', csrf).send({})).status,
    401,
  );
});

test('authenticated admin can load admin assets', async () => {
  const { app } = makeApp();
  const { agent } = await signupOwner(app);
  assert.equal((await agent.get('/admin-assets/admin.js')).status, 200);
});

test('state-changing requests need a valid CSRF token', async () => {
  const { app } = makeApp();
  const { agent } = await signupOwner(app);
  const noToken = await agent.post('/api/admin/games').send({});
  assert.equal(noToken.status, 403);
  const badToken = await agent.post('/api/admin/games').set('X-CSRF-Token', 'wrong').send({});
  assert.equal(badToken.status, 403);
});

test('cross-origin writes are rejected', async () => {
  const { app } = makeApp();
  const res = await request(app)
    .post('/api/public/bookings')
    .set('Origin', 'https://evil.example')
    .send({});
  assert.equal(res.status, 403);
});

test('session cookie is httpOnly and sameSite', async () => {
  const { app } = makeApp();
  const { res } = await signupOwner(app);
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('bgr.sid='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});

test('public API never sets a cookie for customers', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/public/games');
  assert.equal(res.headers['set-cookie'], undefined);
});

test('logout ends the session; password change requires the current password', async () => {
  const { app } = makeApp();
  const { agent, csrf } = await signupOwner(app);

  const bad = await agent.post('/api/admin/password').set('X-CSRF-Token', csrf).send({
    currentPassword: 'wrong wrong',
    newPassword: 'new password',
    confirmPassword: 'new password',
  });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fields.currentPassword);

  const ok = await agent.post('/api/admin/password').set('X-CSRF-Token', csrf).send({
    currentPassword: 'correct horse',
    newPassword: 'new password',
    confirmPassword: 'new password',
  });
  assert.equal(ok.status, 200);

  const out = await agent.post('/api/admin/logout').set('X-CSRF-Token', ok.body.csrfToken);
  assert.equal(out.status, 200);
  assert.equal((await agent.get('/api/admin/dashboard')).status, 401);

  const again = await csrfAgent(app);
  const login = await again.agent
    .post('/api/admin/login')
    .set('X-CSRF-Token', again.csrf)
    .send({ username: 'owner_1', password: 'new password' });
  assert.equal(login.status, 200);
});

test('login is rate limited', async () => {
  const { db } = makeApp();
  const { createApp } = require('../src/app');
  const { load } = require('../src/config');
  const app = createApp({
    db,
    config: load({ NODE_ENV: 'test' }),
    limits: { auth: 3, booking: 100 },
    logger: { info() {}, warn() {}, error() {} },
  });
  const { agent, csrf } = await csrfAgent(app);
  let last;
  for (let i = 0; i < 5; i++)
    last = await agent
      .post('/api/admin/login')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'x_user', password: 'bad bad bad' });
  assert.equal(last.status, 429);
});
