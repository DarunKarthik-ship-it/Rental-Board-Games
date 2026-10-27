// Fetch wrapper for the JSON API. Adds the CSRF token on writes and turns every failure into
// an ApiError with a message that is safe to show to the user.
let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'Something went wrong. Please try again.');
    this.status = status;
    this.body = body || {};
    this.fields = (body && body.fields) || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, {
      error: 'Cannot reach the server. Check your connection and try again.',
    });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data || { error: `Request failed (${res.status}).` });
  return data;
}
