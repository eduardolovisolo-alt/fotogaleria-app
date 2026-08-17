const API_BASE_URL = window.location.origin;

const WHATSAPP_NUMBER = '5491130108299';
const WHATSAPP_ADMIN_PAGES = ['/dashboard.html', '/admin.html', '/admin-gallery.html', '/admin-messages.html'];

function injectWhatsAppButton() {
  if (WHATSAPP_ADMIN_PAGES.includes(window.location.pathname)) return;

  const link = document.createElement('a');
  link.className = 'whatsapp-float';
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola! Vengo de FotoGalería Pro.')}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Escribinos por WhatsApp');
  link.innerHTML = `
    <svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor">
      <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.29.633 4.435 1.735 6.267L4 29l7.938-1.7A11.94 11.94 0 0 0 16.001 27C22.628 27 28 21.627 28 15S22.628 3 16.001 3zm0 21.818c-1.94 0-3.79-.508-5.41-1.47l-.388-.23-4.71 1.008 1.028-4.59-.253-.4A9.77 9.77 0 0 1 6.18 15c0-5.415 4.406-9.818 9.82-9.818 5.414 0 9.818 4.403 9.818 9.818 0 5.415-4.404 9.818-9.818 9.818zm5.393-7.35c-.295-.148-1.746-.862-2.017-.96-.27-.099-.468-.148-.665.148-.197.296-.762.96-.934 1.157-.172.198-.344.222-.64.074-.295-.148-1.245-.459-2.372-1.463-.877-.782-1.47-1.748-1.642-2.044-.172-.296-.018-.456.13-.603.133-.133.296-.345.443-.518.148-.172.197-.296.296-.494.099-.198.05-.37-.025-.518-.074-.148-.665-1.604-.911-2.197-.24-.577-.485-.499-.665-.508-.172-.008-.37-.01-.567-.01-.198 0-.518.074-.79.37-.271.296-1.036 1.013-1.036 2.47 0 1.456 1.06 2.863 1.208 3.06.148.198 2.086 3.186 5.053 4.468.706.305 1.257.487 1.687.623.709.226 1.354.194 1.864.118.569-.085 1.746-.714 1.992-1.403.246-.69.246-1.28.172-1.403-.074-.123-.271-.198-.567-.346z"/>
    </svg>
  `;
  document.body.appendChild(link);
}

document.addEventListener('DOMContentLoaded', injectWhatsAppButton);

// Protección liviana contra descarga casual de fotos: bloquea clic derecho,
// mantener presionado (long-press) y arrastrar sobre imágenes marcadas como
// "protected-photo". No es infalible (dev tools, captura de pantalla siguen
// funcionando), pero frena al usuario casual. La protección real es la
// marca de agua que ya llevan estas imágenes.
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest && e.target.closest('.protected-photo, .img-shield')) {
    e.preventDefault();
  }
});

document.addEventListener('dragstart', (e) => {
  if (e.target.closest && e.target.closest('.protected-photo, .img-shield')) {
    e.preventDefault();
  }
});

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
