// Date helpers. All dates are plain 'YYYY-MM-DD' strings in India time (Asia/Kolkata); we do
// arithmetic in UTC so daylight-saving or server timezone never shifts a day.
const MS_PER_DAY = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for real calendar dates such as 2026-02-28 (not 2026-02-30). */
function isValidDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function toDay(str) {
  return Math.floor(new Date(`${str}T00:00:00Z`).getTime() / MS_PER_DAY);
}

function fromDay(day) {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function addDays(str, n) {
  return fromDay(toDay(str) + n);
}

/** Number of days from a to b (b - a). */
function diffDays(a, b) {
  return toDay(b) - toDay(a);
}

/** Today's date in India time. `now` is injectable for tests. */
function todayIST(now = Date.now()) {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
function weekStart(str) {
  const dow = (new Date(`${str}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(str, -dow);
}

/** Convert a stored UTC ISO timestamp to an India-time date string. */
function isoToISTDate(iso) {
  return todayIST(new Date(iso).getTime());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-27' -> '27 Oct 2026' */
function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** UTC ISO timestamp -> '27 Oct 2026, 5:30 PM' in India time. */
function formatDateTimeIST(iso) {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const h24 = ist.getUTCHours();
  const h12 = h24 % 12 || 12;
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  const date = formatDate(ist.toISOString().slice(0, 10));
  return `${date}, ${h12}:${mm} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

module.exports = {
  isValidDate,
  addDays,
  diffDays,
  todayIST,
  weekStart,
  isoToISTDate,
  formatDate,
  formatDateTimeIST,
};
