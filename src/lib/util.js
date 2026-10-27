// Small shared helpers: HTTP errors, text cleaning and number parsing.

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Strip control characters (keep tab/newline handling to callers), collapse whitespace, trim.
function cleanText(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  let s = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

/** Parse a whole number from a number or numeric string; returns null when invalid. */
function toInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

module.exports = { HttpError, cleanText, toInt };
