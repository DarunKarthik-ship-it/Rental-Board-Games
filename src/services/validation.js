// Input validation + sanitising. Pure functions so they are easy to test; each returns
// { data, errors } where errors is null when valid, else { field: 'message' }.
const { isValidDate, diffDays, addDays } = require('../lib/dates');
const { cleanText, toInt } = require('../lib/util');

const MAX_DAYS = 7;
const MAX_GAMES_PER_BOOKING = 10;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const WHATSAPP_RE = /^91[6-9]\d{9}$/;

/** Normalise an Indian mobile to 10 digits, or return null when it is not valid. */
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function validateBooking(input, { today }) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  // Games: at least one, no duplicates, each a whole number id.
  let gameIds = [];
  if (!Array.isArray(body.gameIds) || body.gameIds.length === 0) {
    errors.games = 'Please choose at least one game.';
  } else {
    const ids = body.gameIds.map(toInt);
    if (ids.some((id) => id === null || id < 1))
      errors.games = 'One of the selected games is invalid.';
    else {
      gameIds = [...new Set(ids)];
      if (gameIds.length > MAX_GAMES_PER_BOOKING)
        errors.games = `You can book up to ${MAX_GAMES_PER_BOOKING} games at a time.`;
    }
  }

  const startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
  if (!startDate) errors.startDate = 'Please choose a start date.';
  else if (!isValidDate(startDate)) errors.startDate = 'Please enter a valid date.';
  else if (startDate < today) errors.startDate = 'Start date cannot be in the past.';
  else if (diffDays(today, startDate) > 365)
    errors.startDate = 'Please choose a date within the next year.';

  const days = toInt(body.days);
  if (days === null || days < 1 || days > MAX_DAYS)
    errors.days = `Number of days must be between 1 and ${MAX_DAYS}.`;

  const areaId = toInt(body.areaId);
  if (areaId === null || areaId < 1) errors.areaId = 'Please choose a delivery area.';

  const flat = cleanText(body.flat);
  if (!flat) errors.flat = 'Please enter your flat / building.';
  else if (flat.length > 120) errors.flat = 'Flat / building is too long (max 120 characters).';

  const street = cleanText(body.street);
  if (!street) errors.street = 'Please enter your street.';
  else if (street.length > 120) errors.street = 'Street is too long (max 120 characters).';

  const landmark = cleanText(body.landmark);
  if (!landmark) errors.landmark = 'Please enter a landmark to help us find you.';
  else if (landmark.length > 120) errors.landmark = 'Landmark is too long (max 120 characters).';

  const name = cleanText(body.name);
  if (!name) errors.name = 'Please enter your name.';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters.';
  else if (name.length > 80) errors.name = 'Name is too long (max 80 characters).';
  else if (!NAME_RE.test(name)) errors.name = "Name can only contain letters, spaces, . ' and -.";

  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  if (!phone) errors.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6-9).';

  const notes = cleanText(typeof body.notes === 'string' ? body.notes : '', { multiline: true });
  if (notes.length > 500) errors.notes = 'Notes are too long (max 500 characters).';

  if (Object.keys(errors).length) return { data: null, errors };
  return {
    data: {
      gameIds,
      startDate,
      days,
      areaId,
      flat,
      street,
      landmark,
      name,
      phone,
      notes,
      returnDate: addDays(startDate, days - 1),
    },
    errors: null,
  };
}

/** Validate the subset of booking fields needed to check availability. */
function validateAvailabilityQuery(input, { today }) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const ids = Array.isArray(body.gameIds) ? body.gameIds.map(toInt) : [];
  if (
    ids.length === 0 ||
    ids.length > MAX_GAMES_PER_BOOKING ||
    ids.some((i) => i === null || i < 1)
  )
    errors.games = 'Please choose at least one valid game.';
  const startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
  if (!isValidDate(startDate)) errors.startDate = 'Please enter a valid date.';
  else if (startDate < today) errors.startDate = 'Start date cannot be in the past.';
  else if (diffDays(today, startDate) > 365)
    errors.startDate = 'Please choose a date within the next year.';
  const days = toInt(body.days);
  if (days === null || days < 1 || days > MAX_DAYS)
    errors.days = `Number of days must be between 1 and ${MAX_DAYS}.`;
  if (Object.keys(errors).length) return { data: null, errors };
  return { data: { gameIds: [...new Set(ids)], startDate, days }, errors: null };
}

function validateUsername(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!USERNAME_RE.test(username))
    return 'Username must be 3-20 characters: letters, numbers or underscore.';
  return null;
}

// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than truncated.
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8)
    return 'Password must be at least 8 characters.';
  if (Buffer.byteLength(value) > 72) return 'Password is too long (max 72 bytes).';
  return null;
}

function validateWhatsappNumber(value) {
  const v = typeof value === 'string' ? value.replace(/[\s+]/g, '') : '';
  return WHATSAPP_RE.test(v)
    ? { value: v, error: null }
    : {
        value: null,
        error: 'Enter the number as 91 followed by a 10-digit mobile, e.g. 919876543210.',
      };
}

function validateGame(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const name = cleanText(body.name);
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 80) errors.name = 'Name is too long (max 80 characters).';

  const description = cleanText(body.description, { multiline: true });
  if (description.length > 400)
    errors.description = 'Description is too long (max 400 characters).';

  const playersMin = toInt(body.playersMin);
  const playersMax = toInt(body.playersMax);
  if (playersMin === null || playersMin < 1 || playersMin > 20)
    errors.playersMin = 'Minimum players must be a whole number from 1 to 20.';
  if (playersMax === null || playersMax < 1 || playersMax > 20)
    errors.playersMax = 'Maximum players must be a whole number from 1 to 20.';
  else if (playersMin !== null && playersMax < playersMin)
    errors.playersMax = 'Maximum players cannot be less than minimum.';

  const playTimeMin = toInt(body.playTimeMin);
  if (playTimeMin === null || playTimeMin < 1 || playTimeMin > 600)
    errors.playTimeMin = 'Play time must be a whole number of minutes (1-600).';

  const ageMin = toInt(body.ageMin);
  if (ageMin === null || ageMin < 0 || ageMin > 99)
    errors.ageMin = 'Age must be a whole number (0-99).';

  const difficulty = typeof body.difficulty === 'string' ? body.difficulty : '';
  if (!['Easy', 'Medium', 'Hard'].includes(difficulty))
    errors.difficulty = 'Choose Easy, Medium or Hard.';

  const pricePerDay = toInt(body.pricePerDay);
  if (pricePerDay === null || pricePerDay < 0 || pricePerDay > 100000)
    errors.pricePerDay = 'Price per day must be a whole number, 0 or more.';

  const deposit = toInt(body.deposit);
  if (deposit === null || deposit < 0 || deposit > 100000)
    errors.deposit = 'Deposit must be a whole number, 0 or more.';

  const copiesOwned =
    body.copiesOwned === undefined || body.copiesOwned === '' ? 1 : toInt(body.copiesOwned);
  if (copiesOwned === null || copiesOwned < 1 || copiesOwned > 100)
    errors.copiesOwned = 'Copies owned must be a whole number of at least 1.';

  if (typeof body.active !== 'boolean' && body.active !== undefined)
    errors.active = 'Active must be true or false.';

  const emoji = cleanText(typeof body.emoji === 'string' ? body.emoji : '') || '🎲';
  if ([...emoji].length > 4) errors.emoji = 'Use a single emoji.';

  if (Object.keys(errors).length) return { data: null, errors };
  return {
    data: {
      name,
      description,
      playersMin,
      playersMax,
      playTimeMin,
      ageMin,
      difficulty,
      pricePerDay,
      deposit,
      copiesOwned,
      active: body.active === undefined ? true : body.active,
      emoji,
    },
    errors: null,
  };
}

function validateSettings(input, validAreaIds) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const wa = validateWhatsappNumber(body.adminWhatsapp);
  if (wa.error) errors.adminWhatsapp = wa.error;

  const bufferDays = toInt(body.bufferDays);
  if (bufferDays === null || bufferDays < 0 || bufferDays > 14)
    errors.bufferDays = 'Buffer days must be a whole number from 0 to 14.';

  const areas = [];
  if (!Array.isArray(body.areas)) errors.areas = 'Areas are required.';
  else {
    body.areas.forEach((a, i) => {
      const id = toInt(a && a.id);
      const fee = toInt(a && a.deliveryFee);
      const note = cleanText(a && typeof a.timeNote === 'string' ? a.timeNote : '');
      if (id === null || !validAreaIds.includes(id)) errors[`area_${i}`] = 'Unknown delivery area.';
      else if (fee === null || fee < 0 || fee > 5000)
        errors[`area_${id}_fee`] = 'Delivery fee must be a whole number, 0 or more.';
      else if (note.length > 120) errors[`area_${id}_note`] = 'Time note is too long (max 120).';
      else areas.push({ id, deliveryFee: fee, timeNote: note });
    });
  }

  if (Object.keys(errors).length) return { data: null, errors };
  return { data: { adminWhatsapp: wa.value, bufferDays, areas }, errors: null };
}

module.exports = {
  MAX_DAYS,
  normalizePhone,
  validateBooking,
  validateAvailabilityQuery,
  validateUsername,
  validatePassword,
  validateWhatsappNumber,
  validateGame,
  validateSettings,
};
