// Central configuration, read once from environment variables (.env is loaded in server.js).
const path = require('node:path');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function load(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const config = {
    isProduction,
    port: Number(env.PORT) || 4173,
    host: env.HOST || '0.0.0.0',
    databasePath: path.resolve(env.DATABASE_PATH || './data/rentals.sqlite'),
    sessionSecret: env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    cookieSecure: bool(env.COOKIE_SECURE, isProduction),
    trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || true : false,
    pendingHoldHours: Number(env.PENDING_HOLD_HOURS) || 24,
    timezone: 'Asia/Kolkata',
  };
  if (isProduction && config.sessionSecret === 'dev-only-insecure-secret-change-me') {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  return config;
}

module.exports = { load };
