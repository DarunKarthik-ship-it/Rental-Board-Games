// Bookings: searchable/filterable list and a detail view with status actions and WhatsApp links.
import { api, ApiError } from '/js/api.js';
import { h, money, formatDate, formatDateTime, plural, debounce } from '/js/dom.js';
import { emptyState, errorState, loadingState } from '/js/ui.js';
import { badge, confirmDialog, toast, icon } from '../ui.js';

const STATUSES = ['Pending', 'Confirmed', 'Delivered', 'Returned', 'Cancelled'];
// Labels for the action buttons shown for each target status.
const ACTION_LABEL = {
  Confirmed: 'Confirm booking',
  Delivered: 'Mark delivered',
  Returned: 'Mark returned',
  Cancelled: 'Cancel booking',
};

// List state survives navigating into a booking and back.
const listState = {
  q: '',
  status: '',
  area: '',
  from: '',
  to: '',
  sort: 'createdAt',
  dir: 'desc',
  page: 1,
};

export async function render({ query }) {
  const id = query.get('id');
  return id ? renderDetail(id) : renderList();
}

// ------------------------------------------------------------------------------ list ----
async function renderList() {
  const { areas } = await api('/api/admin/areas');
  const body = h('div', { class: 'list-body' });
  const search = h('input', {
    type: 'search',
    id: 'q',
    placeholder: 'Booking ID, name or phone',
    value: listState.q,
    'aria-label': 'Search bookings',
  });
  const status = h(
    'select',
    { id: 'f-status', 'aria-label': 'Filter by status' },
    h('option', { value: '' }, 'All statuses'),
    ...STATUSES.map((s) => h('option', { value: s }, s)),
  );
  const area = h(
    'select',
    { id: 'f-area', 'aria-label': 'Filter by area' },
    h('option', { value: '' }, 'All areas'),
    ...areas.map((a) => h('option', { value: String(a.id) }, a.name)),
  );
  const from = h('input', {
    type: 'date',
    id: 'f-from',
    'aria-label': 'Start date from',
    value: listState.from,
  });
  const to = h('input', {
    type: 'date',
    id: 'f-to',
    'aria-label': 'Start date to',
    value: listState.to,
  });
  status.value = listState.status;
  area.value = listState.area;

  async function load() {
    body.replaceChildren(loadingState('Loading bookings…'));
    const params = new URLSearchParams({
      sort: listState.sort,
      dir: listState.dir,
      page: String(listState.page),
      pageSize: '10',
    });
    for (const k of ['q', 'status', 'area', 'from', 'to'])
      if (listState[k]) params.set(k, listState[k]);
    try {
      const data = await api(`/api/admin/bookings?${params}`);
      listState.page = data.page;
      body.replaceChildren(table(data));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      body.replaceChildren(errorState(err.message, load));
    }
  }

  function sortHeader(key, label) {
    const active = listState.sort === key;
    return h(
      'th',
      {
        scope: 'col',
        'aria-sort': active ? (listState.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      },
      h(
        'button',
        {
          type: 'button',
          class: 'th-btn',
          onclick: () => {
            if (active) listState.dir = listState.dir === 'asc' ? 'desc' : 'asc';
            else {
              listState.sort = key;
              listState.dir = 'asc';
            }
            listState.page = 1;
            load();
          },
        },
        label,
        h('span', { 'aria-hidden': 'true' }, active ? (listState.dir === 'asc' ? ' ▲' : ' ▼') : ''),
      ),
    );
  }

  function table(data) {
    const filtered = ['q', 'status', 'area', 'from', 'to'].some((k) => listState[k]);
    if (!data.items.length)
      return emptyState(
        filtered ? 'No bookings match your filters' : 'No bookings yet',
        filtered ? 'Try clearing a filter.' : 'New requests from the website will appear here.',
      );
    return h(
      'div',
      null,
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('caption', { class: 'sr-only' }, 'Bookings'),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              sortHeader('code', 'Booking'),
              sortHeader('customer', 'Customer'),
              h('th', { scope: 'col' }, 'Phone'),
              h('th', { scope: 'col' }, 'Games'),
              sortHeader('startDate', 'Start'),
              sortHeader('returnDate', 'Return'),
              sortHeader('area', 'Area'),
              sortHeader('total', 'Total'),
              sortHeader('status', 'Status'),
            ),
          ),
          h(
            'tbody',
            null,
            ...data.items.map((b) =>
              h(
                'tr',
                null,
                h(
                  'td',
                  null,
                  h('a', { href: `#/admin/bookings?id=${b.id}`, class: 'strong' }, b.code),
                ),
                h('td', null, b.customerName),
                h('td', null, b.phone),
                h('td', { class: 'cell-wrap' }, b.games),
                h('td', null, formatDate(b.startDate)),
                h('td', null, formatDate(b.returnDate)),
                h('td', null, b.area),
                h('td', { class: 'num' }, money(b.total)),
                h(
                  'td',
                  null,
                  badge(b.status),
                  b.holdExpired ? h('span', { class: 'tag-warn' }, 'Hold expired') : null,
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'pager' },
        h(
          'span',
          { class: 'muted' },
          `${plural(data.total, 'booking')} · page ${data.page} of ${data.pages}`,
        ),
        h(
          'div',
          { class: 'pager-btns' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary btn-sm',
              disabled: data.page <= 1,
              onclick: () => {
                listState.page = data.page - 1;
                load();
              },
            },
            'Previous',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary btn-sm',
              disabled: data.page >= data.pages,
              onclick: () => {
                listState.page = data.page + 1;
                load();
              },
            },
            'Next',
          ),
        ),
      ),
    );
  }

  const applyFilters = () => {
    Object.assign(listState, {
      q: search.value.trim(),
      status: status.value,
      area: area.value,
      from: from.value,
      to: to.value,
      page: 1,
    });
    load();
  };
  search.addEventListener('input', debounce(applyFilters, 300));
  for (const el of [status, area, from, to]) el.addEventListener('change', applyFilters);

  const clearBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary btn-sm',
      onclick: () => {
        Object.assign(listState, { q: '', status: '', area: '', from: '', to: '', page: 1 });
        search.value = '';
        status.value = '';
        area.value = '';
        from.value = '';
        to.value = '';
        load();
      },
    },
    'Clear filters',
  );

  const node = h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'panel filters' },
      h('div', { class: 'filter-row' }, search, status, area),
      h(
        'div',
        { class: 'filter-row' },
        h('label', { class: 'inline-label', for: 'f-from' }, 'Start date'),
        from,
        h('label', { class: 'inline-label', for: 'f-to' }, 'to'),
        to,
        clearBtn,
      ),
    ),
    h('section', { class: 'panel panel-flush' }, body),
  );
  await load();
  return node;
}

// ---------------------------------------------------------------------------- detail ----
async function renderDetail(id) {
  const node = h('div', { class: 'stack' });

  async function draw() {
    const {
      booking: b,
      transitions,
      whatsapp,
    } = await api(`/api/admin/bookings/${encodeURIComponent(id)}`);
    const banner = h('div', { class: 'banner banner-error', role: 'alert', hidden: true });

    async function move(target) {
      banner.hidden = true;
      if (target === 'Cancelled') {
        const ok = await confirmDialog({
          title: `Cancel ${b.code}?`,
          message: `This will cancel the booking for ${b.customerName} and free the games. This cannot be undone.`,
          confirmLabel: 'Cancel booking',
          cancelLabel: 'Keep booking',
          danger: true,
        });
        if (!ok) return;
      }
      try {
        await api(`/api/admin/bookings/${b.id}/status`, {
          method: 'POST',
          body: { status: target },
        });
        toast(`${b.code} is now ${target}.`);
        await draw();
      } catch (err) {
        banner.textContent = err.message;
        banner.hidden = false;
        toast(err.message, 'error');
      }
    }

    const dl = (rows) =>
      h('dl', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    const waLink = (href, label) =>
      h(
        'a',
        { class: 'btn btn-wa', href, target: '_blank', rel: 'noopener noreferrer' },
        icon('whatsapp'),
        label,
      );

    node.replaceChildren(
      h('p', null, h('a', { href: '#/admin/bookings', class: 'back' }, '← Back to bookings')),
      banner,
      h(
        'section',
        { class: 'panel' },
        h(
          'div',
          { class: 'detail-head' },
          h(
            'div',
            null,
            h('h2', null, b.code),
            h('p', { class: 'muted' }, `Requested ${formatDateTime(b.createdAt)}`),
          ),
          h(
            'div',
            null,
            badge(b.status),
            b.holdExpired ? h('span', { class: 'tag-warn' }, 'Hold expired') : null,
          ),
        ),
        b.holdExpired
          ? h(
              'p',
              { class: 'banner banner-warn' },
              'This request is older than the hold period, so it no longer reserves the games. Confirming re-checks availability first.',
            )
          : null,
        h(
          'div',
          { class: 'actions' },
          ...transitions.map((t) =>
            h(
              'button',
              {
                type: 'button',
                class: `btn ${t === 'Cancelled' ? 'btn-danger-outline' : ''}`,
                onclick: () => move(t),
              },
              ACTION_LABEL[t],
            ),
          ),
          !transitions.length
            ? h('span', { class: 'muted' }, `No further actions: ${b.status} is final.`)
            : null,
        ),
      ),
      h(
        'div',
        { class: 'grid-2' },
        h(
          'section',
          { class: 'panel' },
          h('h3', null, 'Customer'),
          dl([
            ['Name', b.customerName],
            ['Phone', b.phone],
            ['Area', b.area],
            ['Address', `${b.address.flat}, ${b.address.street}`],
            ['Landmark', b.address.landmark],
            ['Notes', b.notes || 'None'],
          ]),
          b.status === 'Cancelled' || b.status === 'Returned'
            ? h(
                'p',
                { class: 'muted' },
                `WhatsApp messages are available for open bookings. This one is ${b.status}.`,
              )
            : h(
                'div',
                { class: 'actions' },
                waLink(whatsapp.confirmation, 'Message customer on WhatsApp'),
                waLink(whatsapp.reminder, 'Send delivery reminder'),
              ),
        ),
        h(
          'section',
          { class: 'panel' },
          h('h3', null, 'Rental'),
          dl([
            ['Games', b.items.map((i) => i.name).join(', ')],
            ['Start date', formatDate(b.startDate)],
            ['Days', String(b.days)],
            ['Return date', formatDate(b.returnDate)],
            ['Rental amount', money(b.rentalAmount)],
            ['Delivery fee', money(b.deliveryFee)],
            ['Caution deposit (refundable)', money(b.depositTotal)],
            ['Total to collect', h('strong', null, money(b.totalCollect))],
          ]),
        ),
      ),
    );
  }

  await draw();
  return node;
}
