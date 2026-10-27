// Tiny DOM helpers. Everything user-supplied goes in through text nodes / setAttribute, never
// innerHTML, so booking data can't inject markup.
const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function')
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  }
  appendChildren(el, children);
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---- Formatting -------------------------------------------------------------------------
export const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-27' -> '27 Oct 2026' */
export function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-10-27' -> '27 Oct' (compact, for chart labels) */
export function formatDayMonth(str) {
  const [, m, d] = str.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** UTC ISO timestamp -> '27 Oct 2026, 5:30 pm' in India time. */
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function addDays(str, n) {
  const d = new Date(`${str}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- Form fields ------------------------------------------------------------------------
/**
 * Labelled form field with an inline error slot. `control` is the input/select/textarea
 * element; it must already have an id. Use setFieldError(root, name, message) to show errors.
 */
export function field({ name, label, control, hint, required }) {
  const errId = `err-${name}`;
  control.setAttribute('aria-describedby', hint ? `hint-${name} ${errId}` : errId);
  return h(
    'div',
    { class: 'field', dataset: { field: name } },
    h(
      'label',
      { for: control.id },
      label,
      required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null,
    ),
    control,
    hint ? h('p', { class: 'field-hint', id: `hint-${name}` }, hint) : null,
    h('p', { class: 'field-error', id: errId, role: 'alert' }),
  );
}

export function setFieldError(root, name, message) {
  const wrap = root.querySelector(`[data-field="${name}"]`);
  if (!wrap) return false;
  const control = wrap.querySelector('input, select, textarea');
  wrap.classList.toggle('has-error', Boolean(message));
  wrap.querySelector('.field-error').textContent = message || '';
  if (control) {
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  }
  return true;
}

export function clearFieldErrors(root) {
  for (const wrap of root.querySelectorAll('[data-field]'))
    setFieldError(root, wrap.dataset.field, '');
}

/** Password input with a "Show password" toggle. Returns { control, wrap }. */
export function passwordInput({ id, name, autocomplete }) {
  const control = h('input', { id, name, type: 'password', autocomplete, required: true });
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'pw-toggle',
      'aria-pressed': 'false',
      'aria-controls': id,
      onclick: () => {
        const show = control.type === 'password';
        control.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide password' : 'Show password';
        toggle.setAttribute('aria-pressed', String(show));
      },
    },
    'Show password',
  );
  return { control, toggle, wrap: h('div', { class: 'pw-wrap' }, control, toggle) };
}
