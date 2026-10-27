import { h, money, formatDate, formatDateTime, plural } from '../dom.js';
import { emptyState } from '../ui.js';

const KEY = 'bgr:last';

function readLast() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function render() {
  const last = readLast();
  if (!last || !last.booking) {
    return {
      node: h(
        'section',
        { class: 'section' },
        h(
          'div',
          { class: 'container narrow' },
          emptyState(
            'No recent booking found',
            'Start a booking and your confirmation will appear here.',
            h('a', { class: 'btn', href: '#/games' }, 'Browse Games'),
          ),
        ),
      ),
    };
  }

  const { booking: b, whatsappUrl } = last;
  const status = h('p', { class: 'auto-status', role: 'status', 'aria-live': 'polite' });
  let timer = null;

  // Open WhatsApp once, shortly after the page shows. A redirect (not a popup) so browsers do
  // not block it; the big button below is the fallback if WhatsApp does not open.
  if (!last.opened) {
    status.textContent = 'Opening WhatsApp…';
    timer = setTimeout(() => {
      sessionStorage.setItem(KEY, JSON.stringify({ ...last, opened: true }));
      window.location.href = whatsappUrl;
    }, 1500);
  }

  const row = (label, value) =>
    h('div', { class: 'sum-row' }, h('dt', null, label), h('dd', null, value));

  const node = h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'container narrow' },
      h(
        'div',
        { class: 'confirm-card' },
        h('p', { class: 'eyebrow' }, 'Booking request received'),
        h('h1', null, `Thank you, ${b.customerName.split(' ')[0]}!`),
        h('p', { class: 'booking-id' }, 'Booking ID ', h('strong', null, b.code)),
        h('span', { class: 'chip chip-pending' }, 'Pending confirmation'),
        h(
          'p',
          { class: 'confirm-note' },
          'Your booking is confirmed only once we reply on WhatsApp.',
        ),

        h(
          'div',
          { class: 'wa-box' },
          status,
          h(
            'a',
            {
              class: 'btn btn-wa',
              href: whatsappUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            'Send booking details to us on WhatsApp',
          ),
          h('p', { class: 'wa-help' }, 'Tap Send in WhatsApp to complete your booking request.'),
        ),

        h(
          'dl',
          { class: 'summary-list' },
          row('Game(s)', b.items.map((i) => i.name).join(', ')),
          row('Start date', formatDate(b.startDate)),
          row('Rental period', plural(b.days, 'day')),
          row('Return date', formatDate(b.returnDate)),
          row('Delivery to', `${b.address.flat}, ${b.address.street}`),
          row('Landmark', b.address.landmark),
          row('Area', b.area),
          row('Name', b.customerName),
          row('Phone', b.phone),
          b.notes ? row('Notes', b.notes) : null,
          row('Booked at', formatDateTime(b.createdAt)),
          row('Rental amount', money(b.rentalAmount)),
          row('Delivery fee', money(b.deliveryFee)),
          row('Amount payable on delivery', money(b.totalPayable)),
          row('Refundable caution deposit', money(b.depositTotal)),
          row('Total to hand over on delivery', money(b.totalCollect)),
        ),
        h(
          'p',
          { class: 'pay-note' },
          'No online payment. Rental amount and caution deposit are collected at the time of delivery (cash or UPI).',
        ),
        h(
          'p',
          { class: 'cta-row' },
          h('a', { class: 'btn btn-ghost-solid', href: '#/games' }, 'Back to games'),
        ),
      ),
    ),
  );
  return { node, onLeave: () => clearTimeout(timer) };
}
