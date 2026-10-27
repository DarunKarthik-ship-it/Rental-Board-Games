// Express app factory. Everything environment-specific (db, clock, rate limits) is injected so
// tests can build an isolated app.
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const { SqliteStore } = require('./sessionStore');
const { HttpError } = require('./lib/util');
const { todayIST } = require('./lib/dates');
const { publicRoutes } = require('./routes/public');
const { authRoutes, csrfProtect, requireAdmin } = require('./routes/auth');
const { adminRoutes } = require('./routes/admin');

const ROOT = path.resolve(__dirname, '..');
const SESSION_TTL_MS = 8 * 3_600_000;

function createApp({ db, config, clock = Date.now, limits = {}, logger = console }) {
  const app = express();
  const lim = { auth: 10, booking: 30, availability: 120, ...limits };

  // Fresh clock reading for every request (injectable for tests).
  const ctx = () => {
    const now = clock();
    return { now, today: todayIST(now), holdHours: config.pendingHoldHours };
  };

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      frameguard: false, // framing is controlled through CSP frame-ancestors below
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'", 'https://revolte.ai', 'https://*.revolte.ai'],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  // Platform health probe. Do not expose DB details; return 200 only when SQLite responds.
  app.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.status(200).json({ status: 'ok' });
  });

  // Defence in depth: browsers send Origin on cross-site writes; it must match this host.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      const host = URL.canParse(origin) ? new URL(origin).host : null;
      if (host !== req.get('host'))
        return next(new HttpError(403, 'Cross-origin request blocked.'));
    }
    return next();
  });

  const sessionMiddleware = session({
    name: 'bgr.sid',
    secret: config.sessionSecret,
    store: new SqliteStore(db, { ttlMs: SESSION_TTL_MS }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      maxAge: SESSION_TTL_MS,
    },
  });

  // Public API: no session, no cookies for customers.
  app.use('/api/public', publicRoutes({ db, ctx, limits: lim }));

  // Admin API: session on everything; auth endpoints are open, the rest need a login + CSRF.
  const adminApi = express.Router();
  adminApi.use(sessionMiddleware);
  adminApi.use(authRoutes({ db, limits: lim, logger }));
  adminApi.use(requireAdmin, csrfProtect, adminRoutes({ db, ctx }));
  app.use('/api/admin', adminApi);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Admin UI code is only served to a logged-in admin, so it never appears on the public site.
  app.use(
    '/admin-assets',
    sessionMiddleware,
    (req, res, next) =>
      req.session.adminId ? next() : res.status(401).type('text').send('Unauthorized'),
    express.static(path.join(ROOT, 'admin-ui')),
  );

  app.use(
    '/fonts',
    express.static(path.join(ROOT, 'node_modules/@fontsource-variable/fredoka/files')),
  );
  app.use(express.static(path.join(ROOT, 'public')));

  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request too large.' });
    logger.error(`[error] ${req.method} ${req.path}: ${err.stack || err}`);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

module.exports = { createApp };
