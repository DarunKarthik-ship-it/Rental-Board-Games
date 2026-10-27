// Ordered, append-only list of schema migrations. Never edit a migration that has shipped;
// add a new one instead. Each runs once, inside a transaction, and is recorded in
// schema_migrations so re-running is always safe.
module.exports = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        delivery_fee INTEGER NOT NULL CHECK (delivery_fee >= 0),
        time_note TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        players_min INTEGER NOT NULL CHECK (players_min >= 1),
        players_max INTEGER NOT NULL CHECK (players_max >= players_min),
        play_time_min INTEGER NOT NULL CHECK (play_time_min >= 1),
        age_min INTEGER NOT NULL CHECK (age_min >= 0),
        difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy','Medium','Hard')),
        price_per_day INTEGER NOT NULL CHECK (price_per_day >= 0),
        deposit INTEGER NOT NULL CHECK (deposit >= 0),
        copies_owned INTEGER NOT NULL DEFAULT 1 CHECK (copies_owned >= 1),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        emoji TEXT NOT NULL DEFAULT '🎲',
        color INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        area_id INTEGER NOT NULL REFERENCES areas(id),
        area_name TEXT NOT NULL,
        address_flat TEXT NOT NULL,
        address_street TEXT NOT NULL,
        address_landmark TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        start_date TEXT NOT NULL,
        days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 7),
        return_date TEXT NOT NULL,
        rental_amount INTEGER NOT NULL,
        delivery_fee INTEGER NOT NULL,
        deposit_total INTEGER NOT NULL,
        total_payable INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending'
          CHECK (status IN ('Pending','Confirmed','Delivered','Returned','Cancelled')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_bookings_status ON bookings(status);
      CREATE INDEX idx_bookings_dates ON bookings(start_date, return_date);
      CREATE INDEX idx_bookings_created ON bookings(created_at);

      CREATE TABLE booking_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        game_id INTEGER NOT NULL REFERENCES games(id),
        game_name TEXT NOT NULL,
        price_per_day INTEGER NOT NULL,
        deposit INTEGER NOT NULL
      );
      CREATE INDEX idx_booking_items_game ON booking_items(game_id);
      CREATE INDEX idx_booking_items_booking ON booking_items(booking_id);
    `,
  },
  {
    version: 2,
    name: 'reference data: settings and delivery areas',
    // Reference data the app cannot run without. No admin account and no games are created here.
    sql: `
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('business_name', 'Board Game Rentals Bangalore'),
        ('admin_whatsapp', '919999999999'),
        ('buffer_days', '1');

      INSERT OR IGNORE INTO areas (name, delivery_fee, time_note) VALUES
        ('Marathahalli', 50, 'Usually within 2-3 hours of confirmation'),
        ('Panathur', 60, 'Usually within 2-3 hours of confirmation'),
        ('Bellandur', 70, 'Usually within 3-4 hours of confirmation'),
        ('Kadubeesanahalli', 70, 'Usually within 3-4 hours of confirmation');
    `,
  },
];
