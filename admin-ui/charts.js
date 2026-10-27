// Small dependency-free SVG charts. Widths/heights are SVG attributes (no inline styles, so the
// strict CSP is respected) and each chart has a text summary for screen readers.
import { h, svg } from '/js/dom.js';

/** Vertical bar chart. data: [{ label, value }] */
export function barChart(data, { summary }) {
  const W = 480;
  const H = 220;
  const pad = { top: 24, right: 8, bottom: 32, left: 8 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(36, slot * 0.6);
  const plotH = H - pad.top - pad.bottom;

  const bars = data.map((d, i) => {
    const bh = (d.value / max) * plotH;
    const x = pad.left + i * slot + (slot - barW) / 2;
    const y = pad.top + plotH - bh;
    return svg(
      'g',
      null,
      svg('title', null, `${d.label}: ${d.value}`),
      svg('rect', {
        x,
        y,
        width: barW,
        height: Math.max(bh, d.value ? 2 : 0),
        rx: 4,
        class: 'bar',
      }),
      svg(
        'text',
        { x: x + barW / 2, y: y - 6, 'text-anchor': 'middle', class: 'chart-value' },
        d.value,
      ),
      svg(
        'text',
        { x: x + barW / 2, y: H - 10, 'text-anchor': 'middle', class: 'chart-label' },
        d.label,
      ),
    );
  });
  return svg(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': summary },
    svg('line', {
      x1: pad.left,
      x2: W - pad.right,
      y1: pad.top + plotH,
      y2: pad.top + plotH,
      class: 'chart-axis',
    }),
    ...bars,
  );
}

/** Horizontal bar chart. data: [{ label, value }] */
export function hBarChart(data, { summary }) {
  const W = 480;
  const rowH = 36;
  const labelW = 150;
  const H = data.length * rowH + 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const rows = data.map((d, i) => {
    const y = 4 + i * rowH;
    const w = (d.value / max) * (W - labelW - 48);
    return svg(
      'g',
      null,
      svg('title', null, `${d.label}: ${d.value}`),
      svg(
        'text',
        { x: 0, y: y + 22, class: 'chart-label chart-label-left' },
        d.label.length > 20 ? `${d.label.slice(0, 19)}…` : d.label,
      ),
      svg('rect', {
        x: labelW,
        y: y + 6,
        width: Math.max(w, 2),
        height: 20,
        rx: 4,
        class: 'bar bar-alt',
      }),
      svg('text', { x: labelW + w + 8, y: y + 22, class: 'chart-value chart-value-left' }, d.value),
    );
  });
  return h(
    'div',
    null,
    svg(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, class: 'chart chart-h', role: 'img', 'aria-label': summary },
      ...rows,
    ),
  );
}
