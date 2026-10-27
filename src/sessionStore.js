// express-session store backed by the same SQLite database (no extra service needed).
const session = require('express-session');

class SqliteStore extends session.Store {
  constructor(db, { ttlMs }) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
    this.getStmt = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(
      `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
    );
    this.deleteStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?');
    // Purge expired sessions hourly; unref so the timer never keeps the process alive.
    this.timer = setInterval(
      () => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()),
      3_600_000,
    );
    this.timer.unref();
  }

  expiry(sess) {
    return sess && sess.cookie && sess.cookie.expires
      ? Date.parse(sess.cookie.expires)
      : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expires_at < Date.now()) return cb(null, null);
      return cb(null, JSON.parse(row.data));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.setStmt.run(sid, JSON.stringify(sess), this.expiry(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.deleteStmt.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.touchStmt.run(this.expiry(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = { SqliteStore };
