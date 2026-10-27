const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAdminMessage,
  buildCustomerMessage,
  adminBookingUrl,
  customerUrl,
} = require('../src/services/whatsapp');

const booking = {
  code: 'BGR-00007',
  customerName: 'Asha Rao',
  phone: '9845012345',
  address: { flat: 'Flat 402, Tower B', street: '3rd Cross, ORR', landmark: 'Near Decathlon' },
  area: 'Marathahalli',
  items: [{ name: 'Camel Up' }, { name: 'Wingspan' }],
  startDate: '2026-03-12',
  days: 2,
  returnDate: '2026-03-13',
  rentalAmount: 800,
  deliveryFee: 50,
  depositTotal: 4500,
  totalPayable: 850,
  totalCollect: 5350,
  notes: 'Ring the bell twice',
  createdAt: '2026-03-10T06:00:00.000Z',
};

test('admin message contains every required detail with bold labels', () => {
  const msg = buildAdminMessage(booking);
  for (const expected of [
    '*Booking ID:* BGR-00007',
    '*Name:* Asha Rao',
    '*Phone:* 9845012345',
    'Flat 402, Tower B, 3rd Cross, ORR',
    'Near Decathlon',
    '*Area:* Marathahalli',
    '*Game(s):* Camel Up, Wingspan',
    '*Start date:* 12 Mar 2026',
    '*Days:* 2',
    '*Return date:* 13 Mar 2026',
    '*Rental amount:* ₹800',
    '*Delivery fee:* ₹50',
    '*Caution deposit (refundable):* ₹4,500',
    '*Total to collect on delivery:* ₹5,350',
    '*Notes:* Ring the bell twice',
    '*Booked at:* 10 Mar 2026, 11:30 AM',
  ])
    assert.ok(msg.includes(expected), `missing: ${expected}`);
  assert.ok(msg.split('\n').length > 10, 'uses line breaks');
});

test('empty notes are shown as None', () => {
  assert.ok(buildAdminMessage({ ...booking, notes: '' }).includes('*Notes:* None'));
});

test('the wa.me link targets the admin number and is correctly URL-encoded', () => {
  const url = adminBookingUrl(booking, '919876543210');
  assert.ok(url.startsWith('https://wa.me/919876543210?text='));
  const encoded = url.split('?text=')[1];
  assert.ok(encoded.includes('%0A'), 'line breaks encoded');
  assert.ok(encoded.includes('%E2%82%B9'), 'rupee sign encoded');
  assert.ok(encoded.includes('*Booking%20ID%3A*'), 'bold markers are kept literal');
  assert.ok(!/[\s\n₹]/.test(encoded), 'no raw spaces, newlines or ₹');
  assert.equal(decodeURIComponent(encoded), buildAdminMessage(booking));
});

test('customer messages go to the customer with a 91 prefix', () => {
  const confirmation = customerUrl(booking, 'confirmation', 'Board Game Rentals Bangalore');
  const reminder = customerUrl(booking, 'reminder', 'Board Game Rentals Bangalore');
  assert.ok(confirmation.startsWith('https://wa.me/919845012345?text='));
  assert.match(decodeURIComponent(confirmation.split('?text=')[1]), /is confirmed/);
  assert.match(decodeURIComponent(reminder.split('?text=')[1]), /Reminder/);
  assert.notEqual(confirmation, reminder);
  assert.ok(buildCustomerMessage(booking, 'reminder', 'X').includes('₹5,350'));
});
