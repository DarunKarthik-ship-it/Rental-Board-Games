// Admin shell: sidebar + top bar, and a tiny router for the five admin pages. Loaded only for
// a logged-in admin (the server refuses /admin-assets/* without a session).
import { h, clear } from '/js/dom.js';
import { api, ApiError } from '/js/api.js';
import { loadingState, errorState } from '/js/ui.js';
import { icon, toast } from './ui.js';

const PAGES = {
  '/admin': { key: 'dashboard', title: 'Dashboard', load: () => import('./pages/dashboard.js') },
  '/admin/bookings': {
    key: 'bookings',
    title: 'Bookings',
    load: () => import('./pages/bookings.js'),
  },
  '/admin/games': { key: 'games', title: 'Games', load: () => import('./pages/games.js') },
  '/admin/rentals': { key: 'rentals', title: 'Rentals', load: () => import('./pages/rentals.js') },
  '/admin/settings': {
    key: 'settings',
    title: 'Settings',
    load: () => import('./pages/settings.js'),
  },
};
const NAV = [
  ['#/admin', 'dashboard', 'Dashboard'],
  ['#/admin/bookings', 'bookings', 'Bookings'],
  ['#/admin/games', 'games', 'Games'],
  ['#/admin/rentals', 'rentals', 'Rentals'],
  ['#/admin/settings', 'settings', 'Settings'],
];

let shell = null; // { el, main, title, links, sidebar, backdrop, menuBtn }
let cssReady = null;
let pageToken = 0;
let pageCleanup = null;

function loadCss() {
  if (!cssReady) {
    cssReady = new Promise((resolve) => {
      const link = h('link', { rel: 'stylesheet', href: '/admin-assets/admin.css' });
      link.addEventListener('load', resolve);
      link.addEventListener('error', resolve); // render unstyled rather than never
      document.head.append(link);
    });
  }
  return cssReady;
}

async function logout() {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  location.hash = '#/admin-login';
}

function setMenu(open) {
  shell.el.classList.toggle('menu-open', open);
  shell.menuBtn.setAttribute('aria-expanded', String(open));
  if (!open) shell.menuBtn.focus({ preventScroll: true });
}

function buildShell(session) {
  const links = NAV.map(([href, key, label]) =>
    h(
      'a',
      { href, class: 'nav-item', dataset: { key }, onclick: () => setMenu(false) },
      icon(key),
      h('span', null, label),
    ),
  );
  const title = h('h1', { class: 'topbar-title', id: 'page-title' });
  const main = h('main', { id: 'main', class: 'content', tabindex: '-1' });
  const menuBtn = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn menu-btn',
      'aria-label': 'Open menu',
      'aria-expanded': 'false',
      'aria-controls': 'sidebar',
      onclick: () => setMenu(!shell.el.classList.contains('menu-open')),
    },
    icon('menu'),
  );
  const sidebar = h(
    'aside',
    { id: 'sidebar', class: 'sidebar' },
    h(
      'div',
      { class: 'sidebar-brand' },
      h('span', { class: 'logo', 'aria-hidden': 'true' }, '🎲'),
      h('span', null, 'Rentals Admin'),
    ),
    h('nav', { class: 'nav', 'aria-label': 'Admin' }, ...links),
    h(
      'button',
      { type: 'button', class: 'nav-item nav-logout', onclick: logout },
      icon('logout'),
      h('span', null, 'Logout'),
    ),
  );
  const backdrop = h('div', { class: 'backdrop', onclick: () => setMenu(false) });
  const el = h(
    'div',
    { class: 'adm' },
    h(
      'a',
      {
        class: 'skip',
        href: '#main',
        onclick: (e) => {
          e.preventDefault();
          main.focus();
        },
      },
      'Skip to content',
    ),
    sidebar,
    backdrop,
    h(
      'div',
      { class: 'shell' },
      h(
        'header',
        { class: 'topbar' },
        menuBtn,
        title,
        h(
          'span',
          { class: 'topbar-user' },
          h(
            'span',
            { class: 'avatar', 'aria-hidden': 'true' },
            session.username.slice(0, 1).toUpperCase(),
          ),
          h('span', { class: 'user-name' }, session.username),
        ),
        h(
          'button',
          { type: 'button', class: 'btn btn-secondary btn-sm topbar-logout', onclick: logout },
          'Logout',
        ),
      ),
      main,
    ),
  );
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('menu-open')) setMenu(false);
  });
  return { el, main, title, links, sidebar, backdrop, menuBtn };
}

/** Render the admin page for `path` into the shell, creating the shell on first use. */
export async function mount(root, { path, query, session }) {
  await loadCss();
  if (!shell || !root.contains(shell.el)) {
    shell = buildShell(session);
    clear(root).append(shell.el);
  }
  const page = PAGES[path];
  if (!page) return void (location.hash = '#/admin');

  const token = ++pageToken;
  if (pageCleanup) {
    pageCleanup();
    pageCleanup = null;
  }
  shell.title.textContent = page.title;
  document.title = `${page.title} | Admin`;
  for (const a of shell.links) {
    if (a.dataset.key === page.key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  shell.main.replaceChildren(loadingState('Loading…'));

  const draw = async () => {
    try {
      const mod = await page.load();
      const node = await mod.render({ query, session });
      if (token !== pageToken) return;
      pageCleanup = node.cleanup || null;
      shell.main.replaceChildren(node);
    } catch (err) {
      if (token !== pageToken) return;
      if (err instanceof ApiError && err.status === 401) {
        location.hash = '#/admin-login';
        return;
      }
      shell.main.replaceChildren(
        errorState(err.message, () => {
          shell.main.replaceChildren(loadingState('Loading…'));
          draw();
        }),
      );
    }
  };
  await draw();
  shell.main.focus({ preventScroll: true });
}
