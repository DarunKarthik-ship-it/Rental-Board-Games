// Settings: delivery areas, WhatsApp number, buffer days and password change. The public site
// reads these from the database, so saving applies immediately.
import { api, ApiError, setCsrfToken } from '/js/api.js';
import { h, field, setFieldError, clearFieldErrors, passwordInput } from '/js/dom.js';
import { toast } from '../ui.js';

function showErrors(form, banner, err) {
  if (err instanceof ApiError && err.status === 422) {
    let first = null;
    for (const [k, msg] of Object.entries(err.fields)) {
      setFieldError(form, k, msg);
      first = first || k;
    }
    banner.textContent = err.message;
    banner.hidden = false;
    const el = first && form.querySelector(`[data-field="${first}"] input`);
    if (el) el.focus();
  } else {
    banner.textContent = err.message;
    banner.hidden = false;
  }
}

function settingsForm(s) {
  const banner = h('div', { class: 'banner banner-error', role: 'alert', hidden: true });
  const wa = h('input', {
    id: 's-wa',
    name: 'adminWhatsapp',
    type: 'text',
    inputmode: 'numeric',
    value: s.adminWhatsapp,
    placeholder: '919876543210',
  });
  const buffer = h('input', {
    id: 's-buffer',
    name: 'bufferDays',
    type: 'number',
    min: '0',
    max: '14',
    step: '1',
    value: String(s.bufferDays),
  });
  const areaInputs = s.areas.map((a) => ({
    id: a.id,
    fee: h('input', {
      id: `s-fee-${a.id}`,
      type: 'number',
      min: '0',
      step: '1',
      value: String(a.deliveryFee),
    }),
    note: h('input', { id: `s-note-${a.id}`, type: 'text', maxlength: '120', value: a.timeNote }),
    name: a.name,
  }));
  const save = h('button', { type: 'submit', class: 'btn' }, 'Save settings');

  const form = h(
    'form',
    { novalidate: true },
    banner,
    h('h3', null, 'Delivery areas'),
    ...areaInputs.map((a) =>
      h(
        'div',
        { class: 'area-row' },
        h('strong', { class: 'area-name' }, a.name),
        field({ name: `area_${a.id}_fee`, label: 'Delivery fee (₹)', control: a.fee }),
        field({ name: `area_${a.id}_note`, label: 'Delivery time note', control: a.note }),
      ),
    ),
    h('h3', null, 'Orders and notifications'),
    h(
      'div',
      { class: 'grid-2' },
      field({
        name: 'adminWhatsapp',
        label: 'Admin WhatsApp number',
        control: wa,
        hint: 'Format 91XXXXXXXXXX. Customers send booking details to this number.',
      }),
      field({
        name: 'bufferDays',
        label: 'Buffer days between rentals',
        control: buffer,
        hint: 'Days a game is held back after each return (0-14).',
      }),
    ),
    h('div', { class: 'actions' }, save),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearFieldErrors(form);
    banner.hidden = true;
    save.disabled = true;
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          adminWhatsapp: wa.value,
          bufferDays: buffer.value,
          areas: areaInputs.map((a) => ({
            id: a.id,
            deliveryFee: a.fee.value,
            timeNote: a.note.value,
          })),
        },
      });
      toast('Settings saved. The website now uses them.');
    } catch (err) {
      showErrors(form, banner, err);
    } finally {
      save.disabled = false;
    }
  });
  return form;
}

function passwordForm() {
  const banner = h('div', { class: 'banner banner-error', role: 'alert', hidden: true });
  const cur = passwordInput({
    id: 'p-current',
    name: 'currentPassword',
    autocomplete: 'current-password',
  });
  const next = passwordInput({ id: 'p-new', name: 'newPassword', autocomplete: 'new-password' });
  const conf = passwordInput({
    id: 'p-confirm',
    name: 'confirmPassword',
    autocomplete: 'new-password',
  });
  const save = h('button', { type: 'submit', class: 'btn' }, 'Change password');
  const form = h(
    'form',
    { novalidate: true, class: 'narrow-form' },
    banner,
    field({ name: 'currentPassword', label: 'Current password', control: cur.control }),
    field({
      name: 'newPassword',
      label: 'New password',
      control: next.control,
      hint: 'At least 8 characters.',
    }),
    field({ name: 'confirmPassword', label: 'Confirm new password', control: conf.control }),
    save,
  );
  for (const p of [cur, next, conf]) p.control.after(p.toggle);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearFieldErrors(form);
    banner.hidden = true;
    save.disabled = true;
    try {
      const res = await api('/api/admin/password', {
        method: 'POST',
        body: {
          currentPassword: cur.control.value,
          newPassword: next.control.value,
          confirmPassword: conf.control.value,
        },
      });
      setCsrfToken(res.csrfToken);
      form.reset();
      toast('Password changed.');
    } catch (err) {
      showErrors(form, banner, err);
    } finally {
      save.disabled = false;
    }
  });
  return form;
}

export async function render() {
  const s = await api('/api/admin/settings');
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Business settings'),
      h('p', { class: 'muted' }, s.businessName),
      settingsForm(s),
    ),
    h('section', { class: 'panel' }, h('h2', null, 'Change password'), passwordForm()),
  );
}
