// Admin authentication: single owner, signup only while the admins table is empty.
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('../lib/util');
const { validateUsername, validatePassword } = require('../services/validation');

const BCRYPT_COST = 12;
// Compared against when the username does not exist, so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const newCsrfToken = () => crypto.randomBytes(24).toString('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Reject state-changing requests that don't carry the session's CSRF token. */
function csrfProtect(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.get('x-csrf-token');
  if (!req.session || !req.session.csrf || !token || !safeEqual(token, req.session.csrf))
    return next(new HttpError(403, 'Security token missing or expired. Please refresh the page.'));
  return next();
}

function requireAdmin(req, _res, next) {
  if (!req.session || !req.session.adminId) return next(new HttpError(401, 'Please log in.'));
  return next();
}

/** Replace the session id (prevents fixation) and store the new identity + CSRF token. */
function startSession(req, adminId, username) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.adminId = adminId;
      req.session.username = username;
      req.session.csrf = newCsrfToken();
      return req.session.save((e) => (e ? reject(e) : resolve(req.session.csrf)));
    });
  });
}

function authRoutes({ db, limits, logger }) {
  const router = express.Router();

  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins');
  const signupOpen = () => adminCount.get().n === 0;

  const authLimiter = (what) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: limits.auth,
      skipSuccessfulRequests: what === 'login',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
    });

  // Tells the SPA who is logged in, whether signup is open, and gives it a CSRF token.
  router.get('/session', (req, res) => {
    if (!req.session.csrf) req.session.csrf = newCsrfToken();
    res.json({
      authenticated: Boolean(req.session.adminId),
      username: req.session.adminId ? req.session.username : null,
      signupOpen: signupOpen(),
      csrfToken: req.session.csrf,
    });
  });

  router.post('/signup', csrfProtect, authLimiter('signup'), async (req, res) => {
    if (!signupOpen())
      throw new HttpError(403, 'Signup is closed. Please log in.', { code: 'SIGNUP_CLOSED' });

    const { username = '', password = '', confirmPassword = '' } = req.body || {};
    const fields = {};
    const uErr = validateUsername(username);
    if (uErr) fields.username = uErr;
    const pErr = validatePassword(password);
    if (pErr) fields.password = pErr;
    else if (password !== confirmPassword) fields.confirmPassword = 'Passwords do not match.';
    if (Object.keys(fields).length)
      throw new HttpError(422, 'Please fix the errors below.', { fields });

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    // Insert only if the table is still empty, atomically, so two simultaneous signups can't
    // both become owner.
    const result = db
      .prepare(
        `INSERT INTO admins (username, password_hash)
         SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM admins)`,
      )
      .run(username.trim(), hash);
    if (result.changes === 0)
      throw new HttpError(403, 'Signup is closed. Please log in.', { code: 'SIGNUP_CLOSED' });

    const csrfToken = await startSession(req, Number(result.lastInsertRowid), username.trim());
    logger.info(`[auth] owner account created: ${username.trim()}`);
    res.status(201).json({ username: username.trim(), csrfToken });
  });

  router.post('/login', csrfProtect, authLimiter('login'), async (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const admin =
      typeof username === 'string' && typeof password === 'string'
        ? db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim())
        : null;
    const ok = await bcrypt.compare(
      typeof password === 'string' ? password : '',
      admin ? admin.password_hash : DUMMY_HASH,
    );
    if (!admin || !ok) {
      logger.warn('[auth] failed login attempt');
      throw new HttpError(401, 'Incorrect username or password');
    }
    const csrfToken = await startSession(req, admin.id, admin.username);
    logger.info(`[auth] login: ${admin.username}`);
    res.json({ username: admin.username, csrfToken });
  });

  router.post('/logout', csrfProtect, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('bgr.sid');
      return res.json({ ok: true });
    });
  });

  router.post('/password', requireAdmin, csrfProtect, async (req, res) => {
    const { currentPassword = '', newPassword = '', confirmPassword = '' } = req.body || {};
    const fields = {};
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
    if (
      typeof currentPassword !== 'string' ||
      !admin ||
      !(await bcrypt.compare(currentPassword, admin.password_hash))
    )
      fields.currentPassword = 'Current password is incorrect.';
    const pErr = validatePassword(newPassword);
    if (pErr) fields.newPassword = pErr;
    else if (newPassword !== confirmPassword) fields.confirmPassword = 'Passwords do not match.';
    if (Object.keys(fields).length)
      throw new HttpError(422, 'Please fix the errors below.', { fields });

    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
    // Sign out every other session, then rotate this one.
    db.prepare('DELETE FROM sessions').run();
    const csrfToken = await startSession(req, admin.id, admin.username);
    logger.info(`[auth] password changed: ${admin.username}`);
    res.json({ ok: true, csrfToken });
  });

  return router;
}

module.exports = { authRoutes, csrfProtect, requireAdmin };
