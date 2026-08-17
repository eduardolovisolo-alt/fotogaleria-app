const API_BASE_URL = window.location.origin.includes('4000')
  ? window.location.origin
  : 'http://localhost:4000';

async function apiRequest(path, { method = 'GET', body, token, isFormData = false, extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Ocurrió un error inesperado.');
    error.locked = !!data.locked;
    throw error;
  }
  return data;
}

function saveSession({ user, token }) {
  localStorage.setItem('fg_token', token);
  localStorage.setItem('fg_user', JSON.stringify(user));
}

function getSession() {
  const token = localStorage.getItem('fg_token');
  const user = JSON.parse(localStorage.getItem('fg_user') || 'null');
  return token && user ? { token, user } : null;
}

function clearSession() {
  localStorage.removeItem('fg_token');
  localStorage.removeItem('fg_user');
}

function getClientToken() {
  let token = localStorage.getItem('fg_client_token');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('fg_client_token', token);
  }
  return token;
}
