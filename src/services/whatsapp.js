// WhatsApp message + wa.me link generation. Messages use WhatsApp *bold* labels and plain
// line breaks; encodeURIComponent turns line breaks into %0A and ₹ into %E2%82%B9.
const { formatDate, formatDateTimeIST } = require('../lib/dates');

const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function waLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Message the customer sends to the owner after submitting a booking request. */
function buildAdminMessage(b) {
  const lines = [
    '*New Booking Request*',
    '',
    `*Booking ID:* ${b.code}`,
    `*Name:* ${b.customerName}`,
    `*Phone:* ${b.phone}`,
    `*Address:* ${b.address.flat}, ${b.address.street}`,
    `*Landmark:* ${b.address.landmark}`,
    `*Area:* ${b.area}`,
    `*Game(s):* ${b.items.map((i) => i.name).join(', ')}`,
    `*Start date:* ${formatDate(b.startDate)}`,
    `*Days:* ${b.days}`,
    `*Return date:* ${formatDate(b.returnDate)}`,
    '',
    `*Rental amount:* ${money(b.rentalAmount)}`,
    `*Delivery fee:* ${money(b.deliveryFee)}`,
    `*Caution deposit (refundable):* ${money(b.depositTotal)}`,
    `*Total to collect on delivery:* ${money(b.totalCollect)}`,
    '',
    `*Notes:* ${b.notes || 'None'}`,
    `*Booked at:* ${formatDateTimeIST(b.createdAt)}`,
  ];
  return lines.join('\n');
}

/** Message the owner sends to the customer: kind is 'confirmation' or 'reminder'. */
function buildCustomerMessage(b, kind, businessName) {
  const games = b.items.map((i) => i.name).join(', ');
  const head = `Hi ${b.customerName}, this is ${businessName}.`;
  if (kind === 'reminder') {
    return [
      head,
      '',
      `Reminder: we will deliver *${games}* on *${formatDate(b.startDate)}* to ${b.address.flat}, ${b.address.street} (${b.area}).`,
      `Please keep *${money(b.totalCollect)}* ready (cash or UPI), which includes a refundable caution deposit of ${money(b.depositTotal)}.`,
      `Return date: *${formatDate(b.returnDate)}*.`,
      `Booking ID: ${b.code}`,
    ].join('\n');
  }
  return [
    head,
    '',
    `Your booking *${b.code}* is confirmed!`,
    `*Game(s):* ${games}`,
    `*Delivery:* ${formatDate(b.startDate)} to ${b.address.flat}, ${b.address.street} (${b.area})`,
    `*Return date:* ${formatDate(b.returnDate)}`,
    `*Total to pay on delivery:* ${money(b.totalCollect)} (includes refundable caution deposit of ${money(b.depositTotal)})`,
    '',
    'Thank you for choosing us!',
  ].join('\n');
}

const adminBookingUrl = (b, adminNumber) => waLink(adminNumber, buildAdminMessage(b));
const customerUrl = (b, kind, businessName) =>
  waLink(`91${b.phone}`, buildCustomerMessage(b, kind, businessName));

module.exports = {
  money,
  waLink,
  buildAdminMessage,
  buildCustomerMessage,
  adminBookingUrl,
  customerUrl,
};
