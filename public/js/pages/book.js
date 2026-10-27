// Booking request page: multi-game selection, live price summary, availability per game and
// client-side validation that mirrors the server rules (the server is the source of truth).
import { api, ApiError } from '../api.js';
import {
  h,
  money,
  formatDate,
  addDays,
  plural,
  debounce,
  field,
  setFieldError,
  clearFieldErrors,
} from '../dom.js';

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const FIELD_ORDER = [
  'games',
  'startDate',
  'days',
  'areaId',
  'flat',
  'street',
  'landmark',
  'name',
  'phone',
  'notes',
];

function normalizePhone(raw) {
  let d = raw.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export async function render({ query }) {
  const [{ games }, config] = await Promise.all([
    api('/api/public/games'),
    api('/api/public/config'),
  ]);
  const byId = new Map(games.map((g) => [g.id, g]));
  const today = config.today;

  // Games chosen via ?game=ID links (ignores unknown ids and duplicates).
  const selected = [];
  for (const raw of query.getAll('game')) {
    const id = Number(raw);
    if (byId.has(id) && !selected.includes(id)) selected.push(id);
  }
  let availability = new Map(); // gameId -> result from the server
  let availabilityState = 'idle'; // idle | loading | error
  let submitting = false;

  // ---- Form controls -------------------------------------------------------------------
  const addSelect = h('select', { id: 'add-game' });
  const gameList = h('ul', { class: 'picked-games' });
  const startDate = h('input', {
    id: 'startDate',
    name: 'startDate',
    type: 'date',
    min: today,
    value: today,
    required: true,
  });
  const days = h(
    'select',
    { id: 'days', name: 'days' },
    ...Array.from({ length: config.maxDays }, (_, i) =>
      h('option', { value: String(i + 1) }, plural(i + 1, 'day')),
    ),
  );
  const area = h(
    'select',
    { id: 'areaId', name: 'areaId', required: true },
    h('option', { value: '' }, 'Choose your area'),
    ...config.areas.map((a) =>
      h('option', { value: String(a.id) }, `${a.name} (delivery ${money(a.deliveryFee)})`),
    ),
  );
  const flat = h('input', {
    id: 'flat',
    name: 'flat',
    type: 'text',
    autocomplete: 'address-line1',
    maxlength: '120',
    placeholder: 'e.g. Flat 402, Tower B',
    required: true,
  });
  const street = h('input', {
    id: 'street',
    name: 'street',
    type: 'text',
    autocomplete: 'address-line2',
    maxlength: '120',
    placeholder: 'e.g. 3rd Cross, Outer Ring Road',
    required: true,
  });
  const landmark = h('input', {
    id: 'landmark',
    name: 'landmark',
    type: 'text',
    maxlength: '120',
    placeholder: 'e.g. Near the Decathlon store',
    required: true,
  });
  const name = h('input', {
    id: 'name',
    name: 'name',
    type: 'text',
    autocomplete: 'name',
    maxlength: '80',
    required: true,
  });
  const phone = h('input', {
    id: 'phone',
    name: 'phone',
    type: 'tel',
    inputmode: 'numeric',
    autocomplete: 'tel',
    placeholder: '98XXXXXXXX',
    maxlength: '16',
    required: true,
  });
  const notes = h('textarea', {
    id: 'notes',
    name: 'notes',
    rows: '3',
    maxlength: '500',
    placeholder: 'Anything we should know? (optional)',
  });

  const summary = h('div', { class: 'summary-body' });
  const banner = h('div', { class: 'form-banner', role: 'alert', hidden: true });
  const submitBtn = h(
    'button',
    { type: 'submit', class: 'btn btn-large btn-block' },
    'Submit booking request',
  );

  const form = h(
    'form',
    { class: 'book-form', novalidate: true },
    banner,
    h(
      'fieldset',
      { class: 'form-card' },
      h('legend', null, '1. Choose your games'),
      field({ name: 'games', label: 'Add a game', control: addSelect, required: true }),
      gameList,
    ),
    h(
      'fieldset',
      { class: 'form-card' },
      h('legend', null, '2. Rental dates'),
      h(
        'div',
        { class: 'grid-2' },
        field({
          name: 'startDate',
          label: 'Start date (delivery day)',
          control: startDate,
          required: true,
        }),
        field({ name: 'days', label: 'Number of days', control: days, required: true }),
      ),
      h('p', { class: 'return-note', id: 'return-note', 'aria-live': 'polite' }),
    ),
    h(
      'fieldset',
      { class: 'form-card' },
      h('legend', null, '3. Delivery address'),
      field({ name: 'areaId', label: 'Delivery area', control: area, required: true }),
      field({ name: 'flat', label: 'Flat / building', control: flat, required: true }),
      field({ name: 'street', label: 'Street', control: street, required: true }),
      field({ name: 'landmark', label: 'Landmark', control: landmark, required: true }),
    ),
    h(
      'fieldset',
      { class: 'form-card' },
      h('legend', null, '4. Your details'),
      h(
        'div',
        { class: 'grid-2' },
        field({ name: 'name', label: 'Full name', control: name, required: true }),
        field({
          name: 'phone',
          label: 'Mobile number',
          control: phone,
          required: true,
          hint: '10-digit Indian mobile. We will contact you on WhatsApp.',
        }),
      ),
      field({ name: 'notes', label: 'Notes', control: notes }),
    ),
    h(
      'div',
      { class: 'form-card submit-card' },
      h(
        'p',
        { class: 'pay-note' },
        'No online payment. Rental amount and caution deposit are collected at the time of delivery (cash or UPI).',
      ),
      submitBtn,
    ),
  );

  // ---- Rendering helpers ---------------------------------------------------------------
  function drawAddSelect() {
    const rest = games.filter((g) => !selected.includes(g.id));
    addSelect.replaceChildren(
      h('option', { value: '' }, rest.length ? 'Choose a game to add…' : 'All games added'),
      ...rest.map((g) =>
        h('option', { value: String(g.id) }, `${g.emoji} ${g.name} (${money(g.pricePerDay)}/day)`),
      ),
    );
    addSelect.disabled = rest.length === 0;
  }

  function availabilityNote(id) {
    if (availabilityState === 'loading')
      return h('p', { class: 'avail avail-wait' }, 'Checking availability…');
    if (availabilityState === 'error')
      return h(
        'p',
        { class: 'avail avail-no' },
        'Could not check availability right now. You can still submit.',
      );
    const a = availability.get(id);
    if (!a) return null;
    if (a.available) return h('p', { class: 'avail avail-yes' }, 'Available for your dates');
    return h(
      'p',
      { class: 'avail avail-no' },
      a.nextAvailableStart
        ? `Not available for these dates. Next available start date: ${formatDate(a.nextAvailableStart)} `
        : 'Not available for these dates. No upcoming dates are free yet. ',
      a.nextAvailableStart
        ? h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                startDate.value = a.nextAvailableStart;
                onDatesChanged();
              },
            },
            'Use this date',
          )
        : null,
    );
  }

  function drawGames() {
    gameList.replaceChildren(
      ...selected.map((id) => {
        const g = byId.get(id);
        return h(
          'li',
          { class: 'picked' },
          h('span', { class: `picked-tile tile-c${g.color}`, 'aria-hidden': 'true' }, g.emoji),
          h(
            'div',
            { class: 'picked-info' },
            h('strong', null, g.name),
            h(
              'span',
              null,
              `${money(g.pricePerDay)} per day · ${money(g.deposit)} refundable deposit`,
            ),
            availabilityNote(id),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn-ghost',
              'aria-label': `Remove ${g.name}`,
              onclick: () => removeGame(id),
            },
            'Remove',
          ),
        );
      }),
    );
    if (!selected.length)
      gameList.append(h('li', { class: 'picked-empty' }, 'No games selected yet.'));
  }

  function drawSummary() {
    const n = Number(days.value) || 1;
    const perDay = selected.reduce((s, id) => s + byId.get(id).pricePerDay, 0);
    const rental = perDay * n;
    const deposit = selected.reduce((s, id) => s + byId.get(id).deposit, 0);
    const chosenArea = config.areas.find((a) => String(a.id) === area.value);
    const fee = chosenArea ? chosenArea.deliveryFee : 0;
    const payable = rental + fee;
    const row = (label, value, cls) =>
      h('div', { class: `sum-row ${cls || ''}` }, h('dt', null, label), h('dd', null, value));

    summary.replaceChildren(
      selected.length
        ? h(
            'ul',
            { class: 'sum-games' },
            ...selected.map((id) => h('li', null, `${byId.get(id).emoji} ${byId.get(id).name}`)),
          )
        : h('p', { class: 'muted' }, 'Add a game to see your price.'),
      h(
        'dl',
        null,
        row(`Rental (${plural(n, 'day')})`, money(rental)),
        row('Delivery fee', chosenArea ? money(fee) : 'Choose area'),
        row('Amount payable on delivery', money(payable), 'sum-total'),
        row('Refundable caution deposit', money(deposit), 'sum-deposit'),
      ),
      h(
        'p',
        { class: 'sum-collect' },
        `You hand over ${money(payable + deposit)} in total at delivery. The ${money(deposit)} deposit comes back when you return the games.`,
      ),
    );
  }

  function drawReturnNote() {
    const note = form.querySelector('#return-note');
    const n = Number(days.value);
    note.textContent =
      /^\d{4}-\d{2}-\d{2}$/.test(startDate.value) && n
        ? `Return date: ${formatDate(addDays(startDate.value, n - 1))}`
        : '';
  }

  // ---- Availability --------------------------------------------------------------------
  let checkCounter = 0;
  const checkAvailability = debounce(async () => {
    const mine = ++checkCounter;
    if (!selected.length || !startDate.value || startDate.value < today) {
      availability = new Map();
      availabilityState = 'idle';
      return drawGames();
    }
    availabilityState = 'loading';
    drawGames();
    try {
      const { results } = await api('/api/public/availability', {
        method: 'POST',
        body: { gameIds: selected, startDate: startDate.value, days: Number(days.value) },
      });
      if (mine !== checkCounter) return;
      availability = new Map(results.map((r) => [r.gameId, r]));
      availabilityState = 'idle';
    } catch (err) {
      if (mine !== checkCounter) return;
      availability = new Map();
      availabilityState = err instanceof ApiError && err.status === 422 ? 'idle' : 'error';
    }
    drawGames();
  }, 250);

  function onDatesChanged() {
    drawReturnNote();
    drawSummary();
    setFieldError(form, 'startDate', '');
    checkAvailability();
  }

  function addGame(id) {
    if (!selected.includes(id)) selected.push(id);
    setFieldError(form, 'games', '');
    drawAddSelect();
    drawGames();
    drawSummary();
    checkAvailability();
  }

  function removeGame(id) {
    selected.splice(selected.indexOf(id), 1);
    drawAddSelect();
    drawGames();
    drawSummary();
    checkAvailability();
    addSelect.focus();
  }

  // ---- Validation (mirrors the server) -------------------------------------------------
  function validate() {
    const e = {};
    if (!selected.length) e.games = 'Please choose at least one game.';
    if (!startDate.value) e.startDate = 'Please choose a start date.';
    else if (startDate.value < today) e.startDate = 'Start date cannot be in the past.';
    const n = Number(days.value);
    if (!Number.isInteger(n) || n < 1 || n > config.maxDays)
      e.days = `Number of days must be between 1 and ${config.maxDays}.`;
    if (!area.value) e.areaId = 'Please choose a delivery area.';
    if (!flat.value.trim()) e.flat = 'Please enter your flat / building.';
    if (!street.value.trim()) e.street = 'Please enter your street.';
    if (!landmark.value.trim()) e.landmark = 'Please enter a landmark to help us find you.';
    const nm = name.value.trim();
    if (!nm) e.name = 'Please enter your name.';
    else if (nm.length < 2) e.name = 'Name must be at least 2 characters.';
    else if (!NAME_RE.test(nm)) e.name = "Name can only contain letters, spaces, . ' and -.";
    if (!normalizePhone(phone.value))
      e.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6-9).';
    if (notes.value.length > 500) e.notes = 'Notes are too long (max 500 characters).';
    return e;
  }

  function showErrors(errors) {
    clearFieldErrors(form);
    let first = null;
    for (const key of FIELD_ORDER) {
      if (!errors[key]) continue;
      setFieldError(form, key, errors[key]);
      if (!first) first = key;
    }
    return first;
  }

  function showBanner(message) {
    banner.textContent = message;
    banner.hidden = !message;
  }

  function focusField(key) {
    const target = key === 'games' ? addSelect : form.querySelector(`#${key}`);
    if (target) target.focus();
  }

  async function submit(ev) {
    ev.preventDefault();
    if (submitting) return;
    showBanner('');
    const errors = validate();
    const first = showErrors(errors);
    if (first) {
      showBanner('Please fix the highlighted fields and try again.');
      focusField(first);
      return;
    }
    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const result = await api('/api/public/bookings', {
        method: 'POST',
        body: {
          gameIds: selected,
          startDate: startDate.value,
          days: Number(days.value),
          areaId: Number(area.value),
          flat: flat.value,
          street: street.value,
          landmark: landmark.value,
          name: name.value,
          phone: phone.value,
          notes: notes.value,
        },
      });
      sessionStorage.setItem(
        'bgr:last',
        JSON.stringify({ booking: result.booking, whatsappUrl: result.whatsappUrl, opened: false }),
      );
      location.hash = '#/confirmation';
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const firstServer = showErrors(err.fields);
        showBanner(err.message);
        if (firstServer) focusField(firstServer);
      } else if (err instanceof ApiError && err.status === 409 && err.body.unavailable) {
        availability = new Map(err.body.unavailable.map((u) => [u.gameId, u]));
        availabilityState = 'idle';
        drawGames();
        setFieldError(
          form,
          'games',
          'Some games are not available for these dates. See the notes under each game.',
        );
        showBanner('Some games are not available for the dates you chose.');
        focusField('startDate');
      } else {
        showBanner(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit booking request';
    }
  }

  // ---- Wire up -------------------------------------------------------------------------
  addSelect.addEventListener('change', () => {
    if (addSelect.value) addGame(Number(addSelect.value));
  });
  startDate.addEventListener('change', onDatesChanged);
  days.addEventListener('change', onDatesChanged);
  area.addEventListener('change', () => {
    setFieldError(form, 'areaId', '');
    drawSummary();
  });
  for (const el of [flat, street, landmark, name, phone, notes])
    el.addEventListener('input', () => setFieldError(form, el.id, ''));
  form.addEventListener('submit', submit);

  drawAddSelect();
  drawGames();
  drawReturnNote();
  drawSummary();
  if (selected.length) checkAvailability();

  const node = h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'container' },
      h('h1', { class: 'page-title' }, 'Book your games'),
      h('p', { class: 'section-lead' }, 'Tell us what and where. We will confirm on WhatsApp.'),
      h(
        'div',
        { class: 'book-layout' },
        form,
        h(
          'aside',
          { class: 'summary-card', 'aria-label': 'Price summary' },
          h('h2', null, 'Your price'),
          summary,
        ),
      ),
    ),
  );
  return { node, config };
}
