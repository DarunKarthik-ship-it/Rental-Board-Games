// Sample data: four games and a handful of bookings in different states.
// Run manually with `npm run seed`. It never creates an admin account and refuses to run in
// production unless ALLOW_SEED_IN_PRODUCTION=1. It does nothing if games or bookings exist.
require('dotenv').config({ quiet: true });
const { load } = require('../src/config');
const { openDatabase } = require('../src/db');
const { todayIST, addDays } = require('../src/lib/dates');
const { createBooking, changeStatus } = require('../src/services/bookings');

const config = load();
if (config.isProduction && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error('Refusing to seed in production. Set ALLOW_SEED_IN_PRODUCTION=1 to override.');
  process.exit(1);
}

const db = openDatabase(config.databasePath);
const existing =
  db.prepare('SELECT COUNT(*) AS n FROM games').get().n +
  db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n;
if (existing > 0) {
  console.info('Database already has games or bookings; nothing seeded.');
  process.exit(0);
}

const GAMES = [
  [
    'Camel Up',
    'Bet on wacky racing camels that stack on each other. Fast, funny and full of surprises.',
    2,
    8,
    30,
    8,
    'Easy',
    150,
    1500,
    2,
    '🐫',
    1,
  ],
  [
    'Wingspan',
    'A calm, beautiful engine-building game about attracting birds to your wildlife preserve.',
    1,
    5,
    60,
    10,
    'Medium',
    250,
    3000,
    1,
    '🦜',
    2,
  ],
  [
    'Magical Athlete',
    'Race with quirky characters whose special powers break the rules in hilarious ways.',
    2,
    5,
    45,
    8,
    'Medium',
    200,
    2000,
    1,
    '🧙',
    3,
  ],
  [
    'Exploding Kittens',
    'A fast card game of strategy and luck. Draw a kitten and you explode, unless you have a defuse.',
    2,
    5,
    15,
    7,
    'Easy',
    100,
    800,
    2,
    '😼',
    4,
  ],
];
const insertGame = db.prepare(
  `INSERT INTO games (name, description, players_min, players_max, play_time_min, age_min,
     difficulty, price_per_day, deposit, copies_owned, emoji, color)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const ids = {};
for (const g of GAMES) ids[g[0]] = Number(insertGame.run(...g).lastInsertRowid);

const areas = db.prepare('SELECT id, name FROM areas ORDER BY id').all();
const area = (i) => areas[i % areas.length].id;

const realNow = Date.now();
const today = todayIST(realNow);
const DAY = 86_400_000;

// Create bookings "in the past" by simulating the clock, so charts and history look real.
function make({ daysAgo, game, start, days, name, phone, areaIdx, status, notes = '' }) {
  const ctx = { now: realNow - daysAgo * DAY, holdHours: config.pendingHoldHours };
  ctx.today = todayIST(ctx.now);
  const input = {
    gameIds: game.map((g) => ids[g]),
    startDate: addDays(today, start),
    days,
    areaId: area(areaIdx),
    flat: `Flat ${100 + areaIdx * 7}, Sunrise Residency`,
    street: `${areaIdx + 3}th Cross, Outer Ring Road`,
    landmark: 'Near the metro pillar',
    name,
    phone,
    notes,
  };
  const b = createBooking(db, input, ctx);
  const path = {
    Pending: [],
    Confirmed: ['Confirmed'],
    Delivered: ['Confirmed', 'Delivered'],
    Returned: ['Confirmed', 'Delivered', 'Returned'],
    Cancelled: ['Cancelled'],
  }[status];
  for (const s of path) changeStatus(db, b.id, s, ctx);
}

// History (all returned), spread across the last weeks
make({
  daysAgo: 52,
  game: ['Camel Up'],
  start: -50,
  days: 2,
  name: 'Ananya Rao',
  phone: '9845012345',
  areaIdx: 0,
  status: 'Returned',
});
make({
  daysAgo: 45,
  game: ['Wingspan'],
  start: -43,
  days: 3,
  name: 'Rohit Menon',
  phone: '9886123456',
  areaIdx: 1,
  status: 'Returned',
});
make({
  daysAgo: 38,
  game: ['Exploding Kittens', 'Camel Up'],
  start: -36,
  days: 2,
  name: 'Priya Nair',
  phone: '9741234567',
  areaIdx: 2,
  status: 'Returned',
});
make({
  daysAgo: 31,
  game: ['Magical Athlete'],
  start: -29,
  days: 4,
  name: 'Karthik Iyer',
  phone: '9900112233',
  areaIdx: 3,
  status: 'Returned',
});
make({
  daysAgo: 24,
  game: ['Wingspan'],
  start: -22,
  days: 2,
  name: 'Sneha Reddy',
  phone: '9632145870',
  areaIdx: 0,
  status: 'Returned',
});
make({
  daysAgo: 17,
  game: ['Camel Up'],
  start: -15,
  days: 3,
  name: 'Vikram Shetty',
  phone: '9731098765',
  areaIdx: 1,
  status: 'Returned',
});
make({
  daysAgo: 12,
  game: ['Exploding Kittens'],
  start: -10,
  days: 2,
  name: 'Divya Kulkarni',
  phone: '9880456123',
  areaIdx: 2,
  status: 'Cancelled',
  notes: 'Plans changed',
});
// Currently out: one overdue, one due today
make({
  daysAgo: 7,
  game: ['Wingspan'],
  start: -5,
  days: 4,
  name: 'Arjun Gowda',
  phone: '9845678901',
  areaIdx: 0,
  status: 'Delivered',
  notes: 'Call before arriving',
});
make({
  daysAgo: 4,
  game: ['Magical Athlete'],
  start: -2,
  days: 3,
  name: 'Meera Pillai',
  phone: '9448123987',
  areaIdx: 3,
  status: 'Delivered',
});
// Upcoming and waiting on the owner
make({
  daysAgo: 2,
  game: ['Camel Up', 'Exploding Kittens'],
  start: 2,
  days: 2,
  name: 'Rahul Bhat',
  phone: '9663214785',
  areaIdx: 1,
  status: 'Confirmed',
});
make({
  daysAgo: 0,
  game: ['Camel Up'],
  start: 4,
  days: 3,
  name: 'Isha Kapoor',
  phone: '9591234680',
  areaIdx: 2,
  status: 'Pending',
  notes: 'Birthday party, please gift wrap if possible',
});
make({
  daysAgo: 0,
  game: ['Exploding Kittens'],
  start: 3,
  days: 1,
  name: 'Nikhil Joshi',
  phone: '9740011223',
  areaIdx: 0,
  status: 'Pending',
});

console.info(`Seeded ${GAMES.length} games and 12 sample bookings.`);
db.close();
