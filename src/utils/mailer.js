const nodemailer = require('nodemailer');

function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function getTransporter() {
  if (!isMailConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('es-AR');
}

async function sendMail(options) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('El envío de email no está configurado (SMTP).');
  }
  await transporter.sendMail({
    from: fromAddress(),
    ...options,
  });
}

async function sendMailSafe(options) {
  if (!isMailConfigured()) {
    console.warn('Email omitido: SMTP no configurado.');
    return false;
  }
  try {
    await sendMail(options);
    return true;
  } catch (err) {
    console.error('Error al enviar email:', err);
    return false;
  }
}

async function sendPasswordResetEmail(to, resetUrl) {
  await sendMail({
    to,
    subject: 'Recuperar contraseña - FotoGalería Pro',
    html: `
      <p>Recibimos un pedido para restablecer tu contraseña.</p>
      <p><a href="${escapeHtml(resetUrl)}">Hacé click acá para elegir una nueva contraseña</a></p>
      <p>Este enlace vence en 1 hora. Si no lo pediste vos, ignorá este email.</p>
    `,
  });
}

async function sendOrderNotificationToPhotographer({ to, photographerName, clientName, clientEmail, clientPhone, order, gallery, photoNames, adminUrl }) {
  const photosHtml = photoNames.length
    ? `<ul>${photoNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`
    : '<p>Sin detalle de archivos.</p>';

  return sendMailSafe({
    to,
    subject: `Nuevo pedido #${order.id} — ${gallery.name}`,
    html: `
      <p>Hola ${escapeHtml(photographerName || '')},</p>
      <p>Recibiste un pedido nuevo en <strong>${escapeHtml(gallery.name)}</strong>.</p>
      <p>
        <strong>Pedido:</strong> #${order.id}<br/>
        <strong>Cliente:</strong> ${escapeHtml(clientName)}<br/>
        <strong>Email:</strong> ${escapeHtml(clientEmail)}<br/>
        ${clientPhone ? `<strong>Teléfono:</strong> ${escapeHtml(clientPhone)}<br/>` : ''}
        <strong>Fotos:</strong> ${order.photo_count}<br/>
        <strong>Total:</strong> $${formatMoney(order.total_amount)}
      </p>
      ${photosHtml}
      ${adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Ver el pedido en el panel</a></p>` : ''}
    `,
  });
}

async function sendOrderConfirmationToClient({ to, clientName, order, gallery, photoNames, downloadUrl }) {
  const photosHtml = photoNames.length
    ? `<ul>${photoNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`
    : '';
  const accessHtml = order.access_pin
    ? `<p><strong>Pedido:</strong> #${order.id}<br/><strong>PIN:</strong> ${escapeHtml(order.access_pin)}</p>`
    : '';
  const linkHtml = downloadUrl
    ? `<p>Cuando el fotógrafo marque el pedido como pagado, descargá las originales acá:<br/><a href="${escapeHtml(downloadUrl)}">${escapeHtml(downloadUrl)}</a></p>`
    : '';

  return sendMailSafe({
    to,
    subject: `Pedido #${order.id} recibido — ${gallery.name}`,
    html: `
      <p>Hola ${escapeHtml(clientName)},</p>
      <p>Recibimos tu pedido de <strong>${order.photo_count}</strong> foto(s) de <strong>${escapeHtml(gallery.name)}</strong>.</p>
      <p><strong>Total:</strong> $${formatMoney(order.total_amount)}</p>
      ${accessHtml}
      ${photosHtml}
      ${linkHtml}
      <p>Nos vamos a poner en contacto para coordinar el pago y la entrega.</p>
    `,
  });
}

async function sendContactNotification({ to, name, email, phone, message }) {
  return sendMailSafe({
    to,
    replyTo: email,
    subject: `Nuevo mensaje de contacto — ${name}`,
    html: `
      <p>Recibiste un mensaje desde el formulario de contacto.</p>
      <p>
        <strong>Nombre:</strong> ${escapeHtml(name)}<br/>
        <strong>Email:</strong> ${escapeHtml(email)}<br/>
        ${phone ? `<strong>Teléfono:</strong> ${escapeHtml(phone)}<br/>` : ''}
      </p>
      <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
    `,
  });
}

module.exports = {
  isMailConfigured,
  sendPasswordResetEmail,
  sendOrderNotificationToPhotographer,
  sendOrderConfirmationToClient,
  sendContactNotification,
};
