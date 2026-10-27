import { api } from '/js/api.js';
import { h, formatDate, formatDayMonth } from '/js/dom.js';
import { emptyState } from '/js/ui.js';
import { badge } from '../ui.js';
import { barChart, hBarChart } from '../charts.js';

function card(label, value, tone, hint) {
  return h(
    'div',
    { class: `stat stat-${tone || 'neutral'}` },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, String(value)),
    hint ? h('p', { class: 'stat-hint' }, hint) : null,
  );
}

export async function render() {
  const d = await api('/api/admin/dashboard');
  const c = d.cards;

  const weekTotal = d.weeks.reduce((s, w) => s + w.count, 0);
  const weeks = d.weeks.length
    ? barChart(
        d.weeks.map((w) => ({ label: formatDayMonth(w.weekStart), value: w.count })),
        { summary: `Bookings per week for the last 8 weeks, ${weekTotal} in total.` },
      )
    : null;

  const attention = [
    ...d.attention.overdue.map((o) =>
      h(
        'li',
        { class: 'attn' },
        badge('Overdue'),
        h(
          'div',
          { class: 'attn-main' },
          h('a', { href: `#/admin/bookings?id=${o.id}` }, o.code),
          ` ${o.customerName}`,
          h('span', { class: 'muted' }, ` was due ${formatDate(o.returnDate)}`),
        ),
      ),
    ),
    ...d.attention.pending.map((p) =>
      h(
        'li',
        { class: 'attn' },
        badge('Pending'),
        h(
          'div',
          { class: 'attn-main' },
          h('a', { href: `#/admin/bookings?id=${p.id}` }, p.code),
          ` ${p.customerName}`,
          h('span', { class: 'muted' }, ` starts ${formatDate(p.startDate)}`),
          p.holdExpired ? h('span', { class: 'tag-warn' }, 'Hold expired') : null,
        ),
      ),
    ),
  ];

  return h(
    'div',
    { class: 'stack' },
    d.whatsappIsPlaceholder
      ? h(
          'div',
          { class: 'banner banner-warn', role: 'status' },
          'Your WhatsApp number is still the placeholder, so customer booking messages will not reach you. ',
          h('a', { href: '#/admin/settings' }, 'Set it in Settings'),
          '.',
        )
      : null,
    h(
      'section',
      { class: 'stats', 'aria-label': 'Summary' },
      card('Total bookings', c.total),
      card('Pending', c.pending, c.pending ? 'amber' : 'neutral', 'Waiting for your reply'),
      card('Active rentals', c.activeRentals, 'blue'),
      card('Due back today', c.dueToday, c.dueToday ? 'amber' : 'neutral'),
      card('Overdue returns', c.overdue, c.overdue ? 'red' : 'neutral'),
    ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'panel' },
        h('h2', null, 'Bookings per week'),
        h('p', { class: 'muted' }, 'Last 8 weeks, cancelled requests excluded'),
        weeks,
      ),
      h(
        'section',
        { class: 'panel' },
        h('h2', null, 'Most-rented games'),
        h('p', { class: 'muted' }, 'Confirmed, delivered and returned bookings'),
        d.topGames.length
          ? hBarChart(
              d.topGames.map((g) => ({ label: g.name, value: g.count })),
              {
                summary: `Most rented games: ${d.topGames.map((g) => `${g.name} ${g.count}`).join(', ')}.`,
              },
            )
          : emptyState('No rentals yet', 'Games appear here once bookings are confirmed.'),
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Needs attention'),
      attention.length
        ? h('ul', { class: 'attn-list' }, ...attention)
        : emptyState('All clear', 'No pending bookings or overdue returns.'),
    ),
  );
}
