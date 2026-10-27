// Price calculation shared by booking creation. All amounts are whole rupees.
//   rental      = sum of per-day prices of the chosen games x number of days
//   payable     = rental + delivery fee            (the amount for the service)
//   deposit     = sum of refundable caution deposits (shown separately)
//   totalCollect = payable + deposit               (cash/UPI handed over at delivery)
function computePricing({ games, days, deliveryFee }) {
  const perDay = games.reduce((sum, g) => sum + g.pricePerDay, 0);
  const rental = perDay * days;
  const deposit = games.reduce((sum, g) => sum + g.deposit, 0);
  const payable = rental + deliveryFee;
  return { rental, deliveryFee, deposit, payable, totalCollect: payable + deposit };
}

module.exports = { computePricing };
