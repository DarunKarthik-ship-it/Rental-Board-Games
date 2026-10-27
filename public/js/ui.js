// Shared loading / error / empty states for both the public site and the admin portal.
import { h } from './dom.js';

export function loadingState(text = 'Loading…') {
  return h(
    'div',
    { class: 'state state-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    h('p', null, text),
  );
}

export function errorState(message, onRetry) {
  return h(
    'div',
    { class: 'state state-error', role: 'alert' },
    h('p', { class: 'state-title' }, 'Something went wrong'),
    h('p', null, message),
    onRetry ? h('button', { type: 'button', class: 'btn', onclick: onRetry }, 'Try again') : null,
  );
}

export function emptyState(title, text, action) {
  return h(
    'div',
    { class: 'state state-empty' },
    h('p', { class: 'state-title' }, title),
    text ? h('p', null, text) : null,
    action || null,
  );
}
