// Applies pending database migrations. The server also does this on start.
require('dotenv').config({ quiet: true });
const { load } = require('../src/config');
const { openDatabase } = require('../src/db');

const config = load();
const db = openDatabase(config.databasePath);
const versions = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
console.info(`Database ready at ${config.databasePath}`);
for (const v of versions) console.info(`  applied ${v.version}: ${v.name}`);
db.close();
