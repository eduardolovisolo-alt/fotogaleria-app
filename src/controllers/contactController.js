const contactModel = require('../models/contactModel');
const userModel = require('../models/userModel');
const { sendContactNotification } = require('../utils/mailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function notifyAdmins(payload) {
  const recipients = new Set();
  if (process.env.ADMIN_NOTIFY_EMAIL) {
    recipients.add(process.env.ADMIN_NOTIFY_EMAIL);
  }
  const admins = await userModel.findAdmins();
  admins.forEach((admin) => {
    if (admin.email) recipients.add(admin.email);
  });

  await Promise.all([...recipients].map((to) => sendContactNotification({ to, ...payload })));
}

async function submit(req, res) {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Nombre, email y mensaje son obligatorios.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    await contactModel.create({ name: name.trim(), email: email.trim(), phone, message: message.trim() });
    try {
      await notifyAdmins({
        name: name.trim(),
        email: email.trim(),
        phone: phone ? phone.trim() : '',
        message: message.trim(),
      });
    } catch (notifyErr) {
      console.error('contact notify error:', notifyErr);
    }
    res.status(201).json({ message: 'Mensaje enviado. Te vamos a responder a la brevedad.' });
  } catch (err) {
    console.error('contact submit error:', err);
    res.status(500).json({ error: 'Error al enviar el mensaje.' });
  }
}

async function list(req, res) {
  try {
    const messages = await contactModel.findAll();
    res.json({ messages });
  } catch (err) {
    console.error('contact list error:', err);
    res.status(500).json({ error: 'Error al listar los mensajes.' });
  }
}

async function markRead(req, res) {
  try {
    await contactModel.markRead(req.params.id);
    res.json({ message: 'Marcado como leído.' });
  } catch (err) {
    console.error('contact markRead error:', err);
    res.status(500).json({ error: 'Error al actualizar el mensaje.' });
  }
}

module.exports = { submit, list, markRead };
