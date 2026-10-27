// Shared admin UI helpers: icons, status badges, toasts and the confirm dialog.
import { h, svg } from '/js/dom.js';

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  bookings:
    'M7 2v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z',
  games:
    'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm3.5 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 7a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  rentals:
    'M3 7h13v8H3V7zm13 2h3l2 3v3h-5V9zM7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z',
  settings:
    'M19.4 13a7.6 7.6 0 000-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 00-1.7-1L15 3.4h-4L10.7 6a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 000 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 001.7 1l.3 2.6h4l.3-2.6a7.4 7.4 0 001.7-1l2.5 1 2-3.4L19.4 13zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z',
  logout:
    'M10 17l1.4-1.4-2.6-2.6H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h7V3H4a2 2 0 00-2 2v14a2 2 0 002 2h7v-2H4V5z',
  menu: 'M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z',
  close:
    'M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z',
  whatsapp: 'M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V6a2 2 0 012-2z',
};

// Dialogs and toasts live inside .adm so the admin-scoped styles and tokens apply to them.
export const adminRoot = () => document.querySelector('.adm') || document.body;

export function icon(name) {
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 20,
      height: 20,
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'icon',
    },
    svg('path', { d: ICONS[name], fill: 'currentColor' }),
  );
}

export function badge(status) {
  return h('span', { class: `badge badge-${status.toLowerCase().replace(/\s+/g, '-')}` }, status);
}

export function toast(message, type = 'success') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
    adminRoot().append(host);
  }
  const el = h(
    'div',
    { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
    message,
  );
  host.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 3500);
}

/** Modal confirmation built on <dialog> (focus trap + Esc come from the browser). */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  danger = false,
}) {
  return new Promise((resolve) => {
    const dlg = h(
      'dialog',
      { class: 'dlg', 'aria-labelledby': 'dlg-title' },
      h(
        'form',
        { method: 'dialog' },
        h('h2', { id: 'dlg-title' }, title),
        h('p', null, message),
        h(
          'div',
          { class: 'dlg-actions' },
          h('button', { class: 'btn btn-secondary', value: 'cancel', type: 'submit' }, cancelLabel),
          h(
            'button',
            { class: `btn ${danger ? 'btn-danger' : ''}`, value: 'ok', type: 'submit' },
            confirmLabel,
          ),
        ),
      ),
    );
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    adminRoot().append(dlg);
    dlg.showModal();
  });
}
