// Admin signup and login pages. Signup is only reachable while no owner exists; the server
// enforces that, this page just mirrors the same rules for fast feedback.
import { api, ApiError, setCsrfToken } from '../api.js';
import { h, field, setFieldError, clearFieldErrors, passwordInput } from '../dom.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export function renderAuthPage(mode, session) {
  const isSignup = mode === 'signup';

  const username = h('input', {
    id: 'username',
    name: 'username',
    type: 'text',
    autocomplete: 'username',
    autocapitalize: 'none',
    spellcheck: 'false',
    maxlength: '20',
    required: true,
  });
  const pw = passwordInput({
    id: 'password',
    name: 'password',
    autocomplete: isSignup ? 'new-password' : 'current-password',
  });
  const pw2 = isSignup
    ? passwordInput({
        id: 'confirmPassword',
        name: 'confirmPassword',
        autocomplete: 'new-password',
      })
    : null;

  const banner = h('div', { class: 'form-banner', role: 'alert', hidden: true });
  const submit = h(
    'button',
    { type: 'submit', class: 'btn btn-block' },
    isSignup ? 'Create owner account' : 'Log in',
  );

  const form = h(
    'form',
    { class: 'auth-form', novalidate: true },
    banner,
    field({
      name: 'username',
      label: 'Username',
      control: username,
      hint: isSignup ? '3-20 characters: letters, numbers or underscore.' : null,
    }),
    field({
      name: 'password',
      label: 'Password',
      control: pw.control,
      hint: isSignup ? 'At least 8 characters.' : null,
    }),
    isSignup
      ? field({ name: 'confirmPassword', label: 'Confirm password', control: pw2.control })
      : null,
    submit,
  );
  // The toggle sits next to its input inside the field wrapper.
  pw.control.after(pw.toggle);
  pw.control.parentElement.classList.add('pw-field');
  if (pw2) {
    pw2.control.after(pw2.toggle);
    pw2.control.parentElement.classList.add('pw-field');
  }

  function setBanner(msg) {
    banner.textContent = msg || '';
    banner.hidden = !msg;
  }

  function validate() {
    const errors = {};
    if (isSignup) {
      if (!USERNAME_RE.test(username.value.trim()))
        errors.username = 'Username must be 3-20 characters: letters, numbers or underscore.';
      if (pw.control.value.length < 8) errors.password = 'Password must be at least 8 characters.';
      else if (pw.control.value !== pw2.control.value)
        errors.confirmPassword = 'Passwords do not match.';
    } else {
      if (!username.value.trim()) errors.username = 'Enter your username.';
      if (!pw.control.value) errors.password = 'Enter your password.';
    }
    return errors;
  }

  let busy = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); // Enter key submits through here too
    if (busy) return;
    setBanner('');
    clearFieldErrors(form);
    const errors = validate();
    const keys = Object.keys(errors);
    if (keys.length) {
      for (const k of keys) setFieldError(form, k, errors[k]);
      form.querySelector(`#${keys[0]}`).focus();
      return;
    }
    busy = true;
    submit.disabled = true;
    try {
      const body = { username: username.value.trim(), password: pw.control.value };
      if (isSignup) body.confirmPassword = pw2.control.value;
      const res = await api(isSignup ? '/api/admin/signup' : '/api/admin/login', {
        method: 'POST',
        body,
      });
      setCsrfToken(res.csrfToken);
      location.hash = '#/admin';
    } catch (err) {
      if (err instanceof ApiError && err.body.code === 'SIGNUP_CLOSED') {
        location.hash = '#/admin-login';
        return;
      }
      if (err instanceof ApiError && err.status === 422) {
        for (const [k, msg] of Object.entries(err.fields)) setFieldError(form, k, msg);
      } else {
        setBanner(err.message);
      }
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  return h(
    'main',
    { id: 'main', class: 'auth-page' },
    h(
      'div',
      { class: 'auth-card' },
      h('div', { class: 'auth-logo', 'aria-hidden': 'true' }, '🎲'),
      h('h1', null, isSignup ? 'Create owner account' : 'Admin login'),
      h(
        'p',
        { class: 'auth-sub' },
        isSignup
          ? 'The first account becomes the owner. Signup closes right after.'
          : 'Sign in to manage bookings and games.',
      ),
      form,
      !isSignup && session.signupOpen
        ? h(
            'p',
            { class: 'auth-alt' },
            'No owner account yet? ',
            h('a', { href: '#/admin-signup' }, 'Create it'),
          )
        : null,
    ),
  );
}
