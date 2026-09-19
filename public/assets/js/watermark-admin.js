function bindWatermarkAdmin(session) {
  const form = document.getElementById('watermark-form');
  if (!form || !session) return;

  function watermarkPreviewUrl() {
    const params = new URLSearchParams({
      text: document.getElementById('wm-text').value.trim() || 'FotoGalería Pro',
      design: document.getElementById('wm-design').value,
      pattern: document.getElementById('wm-pattern').value,
      texture: document.getElementById('wm-texture').value,
      t: Date.now(),
    });
    return `/api/watermark/preview?${params}`;
  }

  async function loadWatermarkPreview() {
    const img = document.getElementById('wm-preview');
    if (!img) return;
    try {
      const res = await fetch(watermarkPreviewUrl(), {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('preview');
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch {
      img.removeAttribute('src');
    }
  }

  async function loadWatermarkSettings() {
    try {
      const { settings } = await apiRequest('/api/watermark', { token: session.token });
      document.getElementById('wm-text').value = settings.text || '';
      document.getElementById('wm-design').value = settings.design || 'text';
      document.getElementById('wm-pattern').value = settings.pattern || 'diagonal';
      document.getElementById('wm-texture').value = settings.texture || 'strong';
      loadWatermarkPreview();
    } catch {
      loadWatermarkPreview();
    }
  }

  ['wm-text', 'wm-design', 'wm-pattern', 'wm-texture'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadWatermarkPreview);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('wm-save-btn');
    const messageEl = document.getElementById('watermark-message');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const body = new FormData();
    body.append('text', document.getElementById('wm-text').value.trim());
    body.append('design', document.getElementById('wm-design').value);
    body.append('pattern', document.getElementById('wm-pattern').value);
    body.append('texture', document.getElementById('wm-texture').value);
    if (document.getElementById('wm-clear-logo').checked) body.append('clearLogo', '1');
    const logo = document.getElementById('wm-logo').files[0];
    if (logo) body.append('logo', logo);

    try {
      await apiRequest('/api/watermark', { method: 'PUT', token: session.token, body, isFormData: true });
      document.getElementById('wm-logo').value = '';
      document.getElementById('wm-clear-logo').checked = false;
      if (typeof showMessage === 'function') {
        showMessage(messageEl, 'Marca de agua guardada. Después podés aplicarla a las fotos ya subidas.', 'success');
      } else {
        messageEl.textContent = 'Marca de agua guardada.';
        messageEl.className = 'message show success';
      }
      loadWatermarkPreview();
    } catch (err) {
      if (typeof showMessage === 'function') {
        showMessage(messageEl, err.message, 'error');
      } else {
        messageEl.textContent = err.message;
        messageEl.className = 'message show error';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar marca de agua';
    }
  });

  loadWatermarkSettings();
}
