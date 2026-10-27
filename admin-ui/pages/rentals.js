// Rentals: games currently out with customers. Due today = amber, overdue = red.
import { api } from '/js/api.js';
import { h, formatDate, plural } from '/js/dom.js';
import { emptyState } from '/js/ui.js';
import { badge, confirmDialog, toast } from '../ui.js';

export async function render() {
  const holder = h('div');

  async function draw() {
    const { rentals } = await api('/api/admin/rentals');
    if (!rentals.length) {
      holder.replaceChildren(
        emptyState(
          'No active rentals',
          'Games you mark as delivered show up here until they come back.',
        ),
      );
      return;
    }

    async function markReturned(r, button) {
      const ok = await confirmDialog({
        title: `Mark ${r.code} as returned?`,
        message: `${r.games} from ${r.customerName} will be marked returned and become available again.`,
        confirmLabel: 'Mark returned',
      });
      if (!ok) return;
      button.disabled = true;
      try {
        await api(`/api/admin/bookings/${r.id}/status`, {
          method: 'POST',
          body: { status: 'Returned' },
        });
        toast(`${r.code} marked as returned.`);
        await draw();
      } catch (err) {
        button.disabled = false;
        toast(err.message, 'error');
      }
    }

    holder.replaceChildren(
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('caption', { class: 'sr-only' }, 'Active rentals'),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ...[
                'Booking',
                'Customer',
                'Phone',
                'Games',
                'Area',
                'Delivered for',
                'Due back',
                'Due',
                '',
              ].map((t) => h('th', { scope: 'col' }, t)),
            ),
          ),
          h(
            'tbody',
            null,
            ...rentals.map((r) => {
              const button = h('button', { type: 'button', class: 'btn btn-sm' }, 'Mark returned');
              button.addEventListener('click', () => markReturned(r, button));
              return h(
                'tr',
                {
                  class:
                    r.due === 'overdue' ? 'row-overdue' : r.due === 'today' ? 'row-today' : null,
                },
                h(
                  'td',
                  null,
                  h('a', { href: `#/admin/bookings?id=${r.id}`, class: 'strong' }, r.code),
                ),
                h('td', null, r.customerName),
                h('td', null, r.phone),
                h('td', { class: 'cell-wrap' }, r.games),
                h('td', null, r.area),
                h('td', null, formatDate(r.startDate)),
                h('td', null, formatDate(r.returnDate)),
                h(
                  'td',
                  null,
                  r.due === 'overdue'
                    ? badge('Overdue')
                    : r.due === 'today'
                      ? badge('Due today')
                      : badge('On time'),
                  r.due === 'overdue'
                    ? h('span', { class: 'muted small' }, ` ${plural(r.daysOverdue, 'day')} late`)
                    : null,
                ),
                h('td', null, button),
              );
            }),
          ),
        ),
      ),
    );
  }

  await draw();
  return h('section', { class: 'panel panel-flush' }, holder);
}
