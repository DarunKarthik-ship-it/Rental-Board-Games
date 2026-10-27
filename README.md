# Board Game Rentals Bangalore

A small board game rental service: a public customer site where people browse games and submit a booking request, and a password-protected admin portal for the owner. There is no online payment. The rental amount, delivery fee and refundable caution deposit are collected on delivery (cash or UPI).

- **Backend:** Node.js + Express, SQLite via `better-sqlite3`
- **Frontend:** plain HTML, CSS and vanilla JavaScript (ES modules) with hash-based routing, served by the same Node app
- **Currency:** Indian Rupees (₹), all amounts are whole rupees

## Setup

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env     # then edit SESSION_SECRET (required in production)
npm start                # http://localhost:4173
```

The database file is created automatically at `DATABASE_PATH` and migrations run on every start (they are versioned and safe to re-run). A fresh database contains the four delivery areas and default settings, **no games and no admin account**.

### Create the owner account

Open **`/#/admin-signup`** (for local development: `http://localhost:4173/#/admin-signup`). The first person to sign up becomes the owner and is logged in immediately. After that signup closes permanently and the URL redirects to `/#/admin-login`. Do this as soon as you deploy, before sharing the site, because whoever signs up first owns the portal.

### Sample data (optional)

```bash
npm run seed
```

Adds Camel Up, Wingspan, Magical Athlete and Exploding Kittens plus a dozen sample bookings in different states. It never creates an admin, does nothing if games or bookings already exist, and refuses to run when `NODE_ENV=production` unless `ALLOW_SEED_IN_PRODUCTION=1`. It is never run automatically.

## Environment variables

| Variable                   | Default                 | Purpose                                                                      |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `PORT`                     | `4173`                  | HTTP port                                                                    |
| `HOST`                     | `0.0.0.0`               | Bind address                                                                 |
| `NODE_ENV`                 | `development`           | Set `production` when deployed                                               |
| `DATABASE_PATH`            | `./data/rentals.sqlite` | SQLite file (directory is created)                                           |
| `SESSION_SECRET`           | dev-only value          | Signs session cookies. **Required in production.** `openssl rand -base64 32` |
| `COOKIE_SECURE`            | `true` in production    | Send the session cookie over HTTPS only                                      |
| `TRUST_PROXY`              | off                     | Set to `1` behind a reverse proxy so client IPs and secure cookies work      |
| `PENDING_HOLD_HOURS`       | `24`                    | How long a Pending request holds inventory                                   |
| `ALLOW_SEED_IN_PRODUCTION` | unset                   | Lets `npm run seed` run in production                                        |

Business settings (admin WhatsApp number, delivery fees and time notes, buffer days) live in the database and are edited in **Admin > Settings**; the public site reads them on every request. The placeholder admin WhatsApp number is `919999999999`: change it in Settings first.

## Scripts

| Command                           | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm start`                       | Start the server                                                                              |
| `npm run dev`                     | Start with auto-restart on file changes                                                       |
| `npm run migrate`                 | Apply migrations and list them                                                                |
| `npm run seed`                    | Load sample games and bookings                                                                |
| `npm test`                        | Run the test suite (`node:test` + supertest)                                                  |
| `npm run lint`                    | ESLint                                                                                        |
| `npm run format` / `format:check` | Prettier                                                                                      |
| `npm run build`                   | Build check: modules load, schema migrates, every browser import and asset reference resolves |

There is no bundler, so there is nothing to compile; `npm run build` verifies the project is assembled correctly.

## Routes

Public: `#/` home, `#/games`, `#/book` (accepts `?game=ID`), `#/confirmation`.
Admin: `#/admin-signup`, `#/admin-login`, `#/admin`, `#/admin/bookings` (`?id=` for a booking), `#/admin/games`, `#/admin/rentals`, `#/admin/settings`.

API: `/api/public/*` (config, games, availability, bookings) is open; `/api/admin/*` requires a session, and every state-changing request needs the `X-CSRF-Token` header returned by `GET /api/admin/session`. Admin page code is served from `/admin-assets/*` only to a logged-in admin, so the public site never contains admin links or code.

## How the rules work

- **Dates.** A booking of N days starting on day S occupies S to S+N-1; the return date shown is S+N-1. The buffer days follow it, so with one buffer day and a 2-day rental from the 10th, the game is back on the 11th, the 12th is held back, and the next rental can start on the 13th.
- **Inventory.** A game can be booked only if, on every day of the requested period plus buffer days, overlapping active bookings are fewer than `copies owned`. Active means Confirmed, Delivered, or Pending within its hold period. Cancelled and Returned never block. A Delivered booking past its return date keeps blocking until it is marked returned. The check runs inside a transaction when a customer submits, and again when the admin confirms or delivers a booking.
- **Pending holds.** A Pending request reserves its games for `PENDING_HOLD_HOURS` (24h). After that it stays Pending but stops blocking others and is flagged "Hold expired"; confirming it re-checks availability.
- **Status flow.** Pending to Confirmed or Cancelled; Confirmed to Delivered or Cancelled; Delivered to Returned. Returned and Cancelled are final.
- **Amounts.** Payable on delivery = rental + delivery fee. The refundable caution deposit is shown separately; the total handed over is payable + deposit. Prices are snapshotted on the booking, so later edits never change history.

## Security notes

Passwords are hashed with bcrypt; sessions are server-side (SQLite) with httpOnly, SameSite=Strict cookies (Secure in production); login and signup are rate limited; CSRF tokens protect admin writes and writes must be same-origin; all SQL is parameterised; input is validated and sanitised on the server; a strict Content-Security-Policy is set (no inline scripts or styles) and the app may only be framed by itself and revolte.ai.
