import { api } from '../api.js';
import { h, money, formatDate } from '../dom.js';
import { emptyState } from '../ui.js';

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Does a game support exactly n players? (8 means "8 or more".) */
function supportsPlayers(game, n) {
  if (n === 0) return true;
  if (n >= 8) return game.playersMax >= 8;
  return game.playersMin <= n && n <= game.playersMax;
}

function playersText(g) {
  return g.playersMin === g.playersMax ? `${g.playersMin}` : `${g.playersMin}-${g.playersMax}`;
}

function gameCard(g) {
  return h(
    'article',
    { class: 'game-card' },
    h('div', { class: `game-tile tile-c${g.color}`, 'aria-hidden': 'true' }, g.emoji),
    h(
      'div',
      { class: 'game-body' },
      h(
        'div',
        { class: 'game-head' },
        h('h3', null, g.name),
        h('span', { class: `chip chip-${g.difficulty.toLowerCase()}` }, g.difficulty),
      ),
      h('p', { class: 'game-desc' }, g.description),
      h(
        'ul',
        { class: 'game-meta' },
        h('li', null, h('span', { 'aria-hidden': 'true' }, '👥 '), `${playersText(g)} players`),
        h('li', null, h('span', { 'aria-hidden': 'true' }, '⏱ '), `${g.playTimeMin} min`),
        h('li', null, h('span', { 'aria-hidden': 'true' }, '🎂 '), `Ages ${g.ageMin}+`),
      ),
      h(
        'p',
        { class: 'game-price' },
        h('strong', null, `${money(g.pricePerDay)}`),
        ' per day',
        h('span', { class: 'deposit' }, `${money(g.deposit)} refundable deposit`),
      ),
      g.availableNow
        ? h('p', { class: 'avail avail-yes' }, 'Available today')
        : h(
            'p',
            { class: 'avail avail-no' },
            g.nextAvailableStart
              ? `Not free today. Next available start: ${formatDate(g.nextAvailableStart)}`
              : 'Not available right now',
          ),
      h('a', { class: 'btn btn-block', href: `#/book?game=${g.id}` }, 'Book Now'),
    ),
  );
}

export async function render() {
  const [{ games }, config] = await Promise.all([
    api('/api/public/games'),
    api('/api/public/config'),
  ]);
  const grid = h('div', { class: 'game-grid' });
  const count = h('p', { class: 'result-count', 'aria-live': 'polite' });

  const select = h(
    'select',
    { id: 'players', onchange: draw },
    h('option', { value: '0' }, 'Any number of players'),
    ...PLAYER_OPTIONS.map((n) =>
      h(
        'option',
        { value: String(n) },
        n === 8 ? '8 or more players' : `${n} ${n === 1 ? 'player' : 'players'}`,
      ),
    ),
  );

  function draw() {
    const n = Number(select.value);
    const shown = games.filter((g) => supportsPlayers(g, n));
    grid.replaceChildren(
      ...(shown.length
        ? shown.map(gameCard)
        : [
            emptyState(
              games.length ? 'No games for that player count' : 'No games available yet',
              games.length ? 'Try a different number of players.' : 'Please check back soon.',
            ),
          ]),
    );
    count.textContent = games.length ? `Showing ${shown.length} of ${games.length} games` : '';
  }
  draw();

  const node = h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'container' },
      h('h1', { class: 'page-title' }, 'Our games'),
      h(
        'p',
        { class: 'section-lead' },
        'Pick a game and book it for 1 to 7 days. Payment is on delivery.',
      ),
      h(
        'div',
        { class: 'filter-bar' },
        h('label', { for: 'players' }, 'How many players?'),
        select,
        count,
      ),
      grid,
    ),
  );
  return { node, config };
}
