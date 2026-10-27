// Games: list with live status and upcoming bookings; add/edit in a dialog; deactivate instead
// of delete (past bookings keep a snapshot of the game, so history is unaffected).
import { api, ApiError } from '/js/api.js';
import { h, money, formatDate, field, setFieldError, clearFieldErrors } from '/js/dom.js';
import { emptyState } from '/js/ui.js';
import { adminRoot, badge, confirmDialog, toast } from '../ui.js';

const BLANK = {
  name: '',
  description: '',
  playersMin: 2,
  playersMax: 4,
  playTimeMin: 30,
  ageMin: 8,
  difficulty: 'Easy',
  pricePerDay: 150,
  deposit: 1000,
  copiesOwned: 1,
  emoji: '🎲',
  active: true,
};

function num(id, name, value, extra = {}) {
  return h('input', {
    id,
    name,
    type: 'number',
    inputmode: 'numeric',
    step: '1',
    value: String(value),
    ...extra,
  });
}

/** Open the add/edit dialog. Resolves true when something was saved. */
function openGameDialog(game) {
  return new Promise((resolve) => {
    const g = game || BLANK;
    const editing = Boolean(game);
    const controls = {
      name: h('input', {
        id: 'g-name',
        name: 'name',
        type: 'text',
        maxlength: '80',
        value: g.name,
        required: true,
      }),
      description: h(
        'textarea',
        { id: 'g-description', name: 'description', rows: '3', maxlength: '400' },
        g.description,
      ),
      playersMin: num('g-playersMin', 'playersMin', g.playersMin, { min: '1' }),
      playersMax: num('g-playersMax', 'playersMax', g.playersMax, { min: '1' }),
      playTimeMin: num('g-playTimeMin', 'playTimeMin', g.playTimeMin, { min: '1' }),
      ageMin: num('g-ageMin', 'ageMin', g.ageMin, { min: '0' }),
      difficulty: h(
        'select',
        { id: 'g-difficulty', name: 'difficulty' },
        ...['Easy', 'Medium', 'Hard'].map((d) =>
          h('option', { value: d, selected: d === g.difficulty }, d),
        ),
      ),
      pricePerDay: num('g-pricePerDay', 'pricePerDay', g.pricePerDay, { min: '0' }),
      deposit: num('g-deposit', 'deposit', g.deposit, { min: '0' }),
      copiesOwned: num('g-copiesOwned', 'copiesOwned', g.copiesOwned, { min: '1' }),
      emoji: h('input', {
        id: 'g-emoji',
        name: 'emoji',
        type: 'text',
        maxlength: '8',
        value: g.emoji,
      }),
    };
    const active = h('input', { id: 'g-active', type: 'checkbox', checked: g.active });
    const banner = h('div', { class: 'banner banner-error', role: 'alert', hidden: true });
    const save = h(
      'button',
      { type: 'submit', class: 'btn' },
      editing ? 'Save changes' : 'Add game',
    );

    const f = (name, label, hint) => field({ name, label, control: controls[name], hint });
    const form = h(
      'form',
      { novalidate: true },
      h('h2', { id: 'game-dlg-title' }, editing ? `Edit ${g.name}` : 'Add a game'),
      banner,
      f('name', 'Name'),
      f('description', 'Short description'),
      h(
        'div',
        { class: 'grid-3' },
        f('playersMin', 'Min players'),
        f('playersMax', 'Max players'),
        f('playTimeMin', 'Play time (min)'),
      ),
      h(
        'div',
        { class: 'grid-3' },
        f('ageMin', 'Minimum age'),
        f('difficulty', 'Difficulty'),
        f('emoji', 'Emoji'),
      ),
      h(
        'div',
        { class: 'grid-3' },
        f('pricePerDay', 'Price per day (₹)'),
        f('deposit', 'Caution deposit (₹)', 'Refundable'),
        f('copiesOwned', 'Copies owned', 'Whole number, at least 1'),
      ),
      h('label', { class: 'check', for: 'g-active' }, active, ' Active (shown on the public site)'),
      h(
        'div',
        { class: 'dlg-actions' },
        h(
          'button',
          { type: 'button', class: 'btn btn-secondary', onclick: () => dlg.close('cancel') },
          'Cancel',
        ),
        save,
      ),
    );

    const dlg = h('dialog', { class: 'dlg dlg-wide', 'aria-labelledby': 'game-dlg-title' }, form);
    let saved = false;
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(saved);
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearFieldErrors(form);
      banner.hidden = true;
      save.disabled = true;
      const body = { active: active.checked };
      for (const [k, el] of Object.entries(controls)) body[k] = el.value;
      try {
        if (editing) await api(`/api/admin/games/${g.id}`, { method: 'PUT', body });
        else await api('/api/admin/games', { method: 'POST', body });
        saved = true;
        toast(editing ? 'Game updated.' : 'Game added.');
        dlg.close('saved');
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          let first = null;
          for (const [k, msg] of Object.entries(err.fields)) {
            setFieldError(form, k, msg);
            first = first || k;
          }
          banner.textContent = err.message;
          banner.hidden = false;
          if (first && controls[first]) controls[first].focus();
        } else {
          banner.textContent = err.message;
          banner.hidden = false;
        }
      } finally {
        save.disabled = false;
      }
    });

    adminRoot().append(dlg);
    dlg.showModal();
    controls.name.focus();
  });
}

export async function render() {
  const holder = h('div', { class: 'stack' });

  async function draw() {
    const { games } = await api('/api/admin/games');

    async function toggleActive(g) {
      if (g.active) {
        const ok = await confirmDialog({
          title: `Deactivate ${g.name}?`,
          message:
            'It will disappear from the public site. Existing bookings are not affected and you can reactivate it any time.',
          confirmLabel: 'Deactivate',
          danger: true,
        });
        if (!ok) return;
      }
      try {
        const { status, copiesOut, upcoming, ...rest } = g; // eslint-disable-line no-unused-vars
        await api(`/api/admin/games/${g.id}`, {
          method: 'PUT',
          body: { ...rest, active: !g.active },
        });
        toast(g.active ? `${g.name} deactivated.` : `${g.name} is active again.`);
        await draw();
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    const cards = games.map((g) =>
      h(
        'article',
        { class: `panel game-row ${g.active ? '' : 'is-inactive'}` },
        h(
          'div',
          { class: 'game-row-main' },
          h('span', { class: 'game-emoji', 'aria-hidden': 'true' }, g.emoji),
          h(
            'div',
            null,
            h('h3', null, g.name, ' ', badge(g.status)),
            h(
              'p',
              { class: 'muted' },
              `${g.playersMin}-${g.playersMax} players · ${g.playTimeMin} min · ages ${g.ageMin}+ · ${g.difficulty}`,
            ),
            h(
              'p',
              null,
              `${money(g.pricePerDay)} per day · ${money(g.deposit)} deposit · ${g.copiesOwned} ${g.copiesOwned === 1 ? 'copy' : 'copies'} (${g.copiesOut} out)`,
            ),
          ),
        ),
        h(
          'div',
          { class: 'game-row-upcoming' },
          h('h4', null, 'Upcoming bookings'),
          g.upcoming.length
            ? h(
                'ul',
                { class: 'plain' },
                ...g.upcoming.map((u) =>
                  h(
                    'li',
                    null,
                    h('a', { href: `#/admin/bookings?id=${u.id}` }, u.code),
                    ` ${formatDate(u.startDate)} to ${formatDate(u.returnDate)} `,
                    badge(u.status),
                  ),
                ),
              )
            : h('p', { class: 'muted' }, 'None'),
        ),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary btn-sm',
              onclick: async () => {
                if (await openGameDialog(g)) draw();
              },
            },
            'Edit',
          ),
          h(
            'button',
            {
              type: 'button',
              class: `btn btn-sm ${g.active ? 'btn-danger-outline' : ''}`,
              onclick: () => toggleActive(g),
            },
            g.active ? 'Deactivate' : 'Activate',
          ),
        ),
      ),
    );

    holder.replaceChildren(
      h(
        'div',
        { class: 'toolbar' },
        h('p', { class: 'muted' }, `${games.length} ${games.length === 1 ? 'game' : 'games'}`),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: async () => {
              if (await openGameDialog(null)) draw();
            },
          },
          'Add game',
        ),
      ),
      ...(cards.length
        ? cards
        : [emptyState('No games yet', 'Add your first game to show it on the website.')]),
    );
  }

  await draw();
  return holder;
}
