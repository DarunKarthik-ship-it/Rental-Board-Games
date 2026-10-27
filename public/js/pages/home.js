import { api } from '../api.js';
import { h, money } from '../dom.js';

const STEPS = [
  ['🎯', 'Choose a game', 'Pick one or more games from our collection.'],
  ['📍', 'Book and tell us where', 'Share your dates and delivery address in a minute.'],
  [
    '🚚',
    'We deliver and you pay on delivery',
    'Cash or UPI when the game arrives. No online payment.',
  ],
];

const FAQ = [
  [
    'What if a game gets damaged?',
    'Please treat the games with care. If pieces go missing or a game is damaged, we will tell you what repair or replacement involves and may adjust it against your caution deposit. We always explain before deducting anything.',
  ],
  [
    'What happens if I return late?',
    'Message us on WhatsApp before your return date if you need more time and we will try to extend it, if nobody else has booked the game. Late returns may be charged extra days at the daily rental price.',
  ],
  [
    'How do I get my deposit back?',
    'The caution deposit is fully refundable. When we collect the game we check that it is complete and in good condition, and then refund your deposit by cash or UPI.',
  ],
  [
    'Can I cancel my booking?',
    'Yes. Message us on WhatsApp with your booking ID before delivery and we will cancel it. You have not paid anything online, so there is nothing to refund.',
  ],
  [
    'How does payment work?',
    'There is no online payment. The rental amount, delivery fee and the refundable caution deposit are collected when the game is delivered, by cash or UPI.',
  ],
];

export async function render() {
  const config = await api('/api/public/config');

  const node = h(
    'div',
    null,
    h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'container hero-inner' },
        h(
          'div',
          { class: 'hero-copy' },
          h('p', { class: 'eyebrow' }, 'Board game rentals in Bangalore'),
          h('h1', null, config.businessName),
          h(
            'p',
            { class: 'tagline' },
            'Game night, delivered to your door. Pick a game, we bring it, you pay on delivery.',
          ),
          h('a', { class: 'btn btn-large', href: '#/games' }, 'Browse Games'),
        ),
        h(
          'div',
          { class: 'hero-art', 'aria-hidden': 'true' },
          h('span', { class: 'die die-1' }, '🎲'),
          h('span', { class: 'die die-2' }, '🐫'),
          h('span', { class: 'die die-3' }, '🦜'),
          h('span', { class: 'die die-4' }, '😼'),
        ),
      ),
    ),

    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'container' },
        h('h2', null, 'How it works'),
        h(
          'ol',
          { class: 'steps' },
          ...STEPS.map(([emoji, title, text], i) =>
            h(
              'li',
              { class: 'step' },
              h('span', { class: 'step-num', 'aria-hidden': 'true' }, i + 1),
              h('span', { class: 'step-emoji', 'aria-hidden': 'true' }, emoji),
              h('h3', null, title),
              h('p', null, text),
            ),
          ),
        ),
      ),
    ),

    h(
      'section',
      { class: 'section section-tint' },
      h(
        'div',
        { class: 'container' },
        h('h2', null, 'Where we deliver'),
        h('p', { class: 'section-lead' }, 'We currently deliver to these areas only.'),
        h(
          'ul',
          { class: 'areas' },
          ...config.areas.map((a) =>
            h(
              'li',
              { class: 'area-card' },
              h('h3', null, a.name),
              h('p', { class: 'area-fee' }, `Delivery fee ${money(a.deliveryFee)}`),
              h('p', { class: 'area-note' }, a.timeNote),
            ),
          ),
        ),
      ),
    ),

    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'container narrow' },
        h('h2', null, 'Good to know'),
        h(
          'div',
          { class: 'faq' },
          ...FAQ.map(([q, a]) => h('details', null, h('summary', null, q), h('p', null, a))),
        ),
        h('p', { class: 'cta-row' }, h('a', { class: 'btn', href: '#/games' }, 'See what we have')),
      ),
    ),
  );
  return { node, config };
}
