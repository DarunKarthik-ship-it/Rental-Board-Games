require('dotenv').config({ quiet: true });
const { load } = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const config = load();
if (config.isProduction && config.cookieSecure && !config.trustProxy) {
  console.warn(
    'COOKIE_SECURE is on but TRUST_PROXY is not set. Behind an HTTPS proxy, set TRUST_PROXY=1 or admin login will not stick.',
  );
}
const db = openDatabase(config.databasePath);
const app = createApp({ db, config });

const server = app.listen(config.port, config.host, () => {
  console.info(`Board Game Rentals listening on http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
