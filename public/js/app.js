// Hash router. Public pages render inside a playful layout; admin login/signup use a plain
// auth layout; the admin portal itself is loaded on demand from /admin-assets (session only).
import { api, setCsrfToken } from './api.js';
import { h, clear } from './dom.js';
import { loadingState, errorState } from './ui.js';
import * as home from './pages/home.js';
import * as games from './pages/games.js';
import * as book from './pages/book.js';
import * as confirmation from './pages/confirmation.js';
import { renderAuthPage } from './pages/adminAuth.js';

const root = document.getElementById('app');
const PUBLIC_ROUTES = {
  '/': { page: home, title: 'Board games delivered in Bangalore', nav: 'home' },
  '/games': { page: games, title: 'Games', nav: 'games' },
  '/book': { page: book, title: 'Book a game', nav: 'book' },
  '/confirmation': { page: confirmation, title: 'Booking request received', nav: 'book' },
};

let renderToken = 0;
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

function publicLayout(content, active, config) {
  const link = (href, key, label) =>
    h('a', { href, class: 'nav-link', 'aria-current': active === key ? 'page' : null }, label);
  const name = (config && config.businessName) || 'Board Game Rentals Bangalore';
  return h(
    'div',
    { class: 'site' },
    h(
      'header',
      { class: 'site-header' },
      h(
        'div',
        { class: 'container header-inner' },
        h(
          'a',
          { class: 'brand', href: '#/' },
          h('span', { class: 'brand-dice', 'aria-hidden': 'true' }, '🎲'),
          h('span', { class: 'brand-name' }, name),
        ),
        h(
          'nav',
          { class: 'nav', 'aria-label': 'Main' },
          link('#/', 'home', 'Home'),
          link('#/games', 'games', 'Games'),
          h('a', { href: '#/book', class: 'btn btn-small' }, 'Book now'),
        ),
      ),
    ),
    h('main', { id: 'main', tabindex: '-1' }, content),
    h(
      'footer',
      { class: 'site-footer' },
      h(
        'div',
        { class: 'container footer-inner' },
        h(
          'div',
          null,
          h('strong', null, name),
          h('p', null, 'Board games for rent, delivered to your door in Bangalore.'),
        ),
        h(
          'div',
          null,
          h('p', null, 'Phone: +91 98XXX XXXXX'),
          h('p', null, 'WhatsApp: +91 98XXX XXXXX'),
          h('p', null, 'Email: hello@example.com'),
        ),
        h(
          'div',
          null,
          h('p', null, 'Open daily, 9 am to 8 pm'),
          h('p', null, 'Serving Marathahalli, Panathur, Bellandur and Kadubeesanahalli'),
        ),
      ),
    ),
  );
}

async function renderPublic(route, query, token) {
  document.body.className = 'mode-public';
  clear(root).append(publicLayout(loadingState('Loading…'), route.nav));
  try {
    const { node, config, onLeave } = await route.page.render({ query });
    if (token !== renderToken) return onLeave && onLeave();
    cleanup = onLeave || null;
    clear(root).append(publicLayout(node, route.nav, config));
    document.title = `${route.title} | ${(config && config.businessName) || 'Board Game Rentals Bangalore'}`;
  } catch (err) {
    if (token !== renderToken) return;
    clear(root).append(
      publicLayout(
        errorState(err.message, () => renderPublic(route, query, ++renderToken)),
        route.nav,
      ),
    );
  }
  window.scrollTo(0, 0);
  const main = document.getElementById('main');
  if (main) main.focus({ preventScroll: true });
}

async function renderAuth(mode, token) {
  document.body.className = 'mode-auth';
  clear(root).append(loadingState('Loading…'));
  try {
    const session = await api('/api/admin/session');
    if (token !== renderToken) return;
    setCsrfToken(session.csrfToken);
    if (session.authenticated) return void (location.hash = '#/admin');
    if (mode === 'signup' && !session.signupOpen) return void (location.hash = '#/admin-login');
    document.title = mode === 'signup' ? 'Create owner account' : 'Admin login';
    clear(root).append(renderAuthPage(mode, session));
  } catch (err) {
    clear(root).append(errorState(err.message, () => renderAuth(mode, ++renderToken)));
  }
}

async function renderAdmin(path, query, token) {
  document.body.className = 'mode-admin';
  if (!document.querySelector('.adm')) clear(root).append(loadingState('Loading…'));
  try {
    const session = await api('/api/admin/session');
    if (token !== renderToken) return;
    setCsrfToken(session.csrfToken);
    if (!session.authenticated) return void (location.hash = '#/admin-login');
    const admin = await import('/admin-assets/admin.js');
    if (token !== renderToken) return;
    await admin.mount(root, { path, query, session });
  } catch (err) {
    clear(root).append(errorState(err.message, () => renderAdmin(path, query, ++renderToken)));
  }
}

function route() {
  const token = ++renderToken;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const { path, query } = parseHash();
  if (path === '/admin-signup') return renderAuth('signup', token);
  if (path === '/admin-login') return renderAuth('login', token);
  if (path === '/admin' || path.startsWith('/admin/')) return renderAdmin(path, query, token);
  const entry = PUBLIC_ROUTES[path];
  if (!entry) return void (location.hash = '#/');
  return renderPublic(entry, query, token);
}

window.addEventListener('hashchange', route);
route();
