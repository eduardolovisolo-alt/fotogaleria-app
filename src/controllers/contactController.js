const contactModel = require('../models/contactModel');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
