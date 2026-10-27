// Database connection and migration runner.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const migrations = require('./migrations');

/** Apply any migrations that have not run yet. Safe to call on every start. */
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version),
  );
  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      record.run(m.version, m.name);
    })();
  }
}

/** Open the database (':memory:' for tests) and bring the schema up to date. */
function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

module.exports = { openDatabase, migrate };
