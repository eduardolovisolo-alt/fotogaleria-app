const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const { signToken } = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { isValidWhatsAppNumber, toWhatsAppNumber, formatWhatsAppDisplay } = require('../utils/whatsapp');
const { uniquePhotographerSlug } = require('../utils/slug');
const { panelPath } = require('../middleware/staffMiddleware');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function register(req, res) {
  try {
    const { name, email, password, asPhotographer, whatsappNumber } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const existing = await userModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const adminExists = await userModel.anyAdminExists();
    if (adminExists && !asPhotographer) {
      return res.status(400).json({
        error: 'El registro es solo para fotógrafos. Los clientes piden las fotos sin cuenta.',
      });
    }

    let role = 'admin';
    let photographerStatus = null;
    let publicSlug = null;
    let whatsapp = null;

    if (asPhotographer) {
      if (!isValidWhatsAppNumber(whatsappNumber)) {
        return res.status(400).json({ error: 'El WhatsApp es obligatorio para registrarte como fotógrafo.' });
      }
      whatsapp = toWhatsAppNumber(whatsappNumber);
      publicSlug = await uniquePhotographerSlug(name);
      if (adminExists) {
        role = 'photographer';
        photographerStatus = 'pending';
      }
    }

    const user = await userModel.create({
      name,
      email,
      passwordHash,
      role,
      photographerStatus,
      publicSlug,
      whatsappNumber: whatsapp,
    });

    const token = signToken({ sub: user.id, role: user.role, photographerStatus: user.photographer_status });
    res.status(201).json({ user, token, panel: panelPath(user) });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Error interno al registrar el usuario.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const safeUser = await userModel.findById(user.id);
    const token = signToken({
      sub: safeUser.id,
      role: safeUser.role,
      photographerStatus: safeUser.photographer_status,
    });
    res.json({ user: safeUser, token, panel: panelPath(safeUser) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
}

async function me(req, res) {
  const user = await userModel.findById(req.user.sub);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }
  res.json({ user });
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'El email es obligatorio.' });
    }

    const user = await userModel.findByEmail(email);
    // Responder igual exista o no el usuario, para no filtrar qué emails están registrados.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await userModel.setResetToken(user.id, tokenHash, expiresAt);

      const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const resetUrl = `${appUrl}/reset-password.html?token=${rawToken}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (mailErr) {
        console.error('forgotPassword mail error:', mailErr);
      }
    }

    res.json({ message: 'Si el email existe, vas a recibir instrucciones para restablecer tu contraseña.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ error: 'Error interno al procesar el pedido.' });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const tokenHash = hashToken(token);
    const user = await userModel.findByValidResetToken(tokenHash);
    if (!user) {
      return res.status(400).json({ error: 'El enlace es inválido o ya venció.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await userModel.resetPassword(user.id, passwordHash);

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ error: 'Error interno al restablecer la contraseña.' });
  }
}

async function updateWhatsApp(req, res) {
  try {
    const account = await userModel.findById(req.user.sub);
    if (!account || (account.role !== 'admin' && account.role !== 'photographer')) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción.' });
    }
    const raw = req.body && req.body.whatsappNumber;
    if (!isValidWhatsAppNumber(raw)) {
      return res.status(400).json({ error: 'Ingresá un WhatsApp válido, con código de área. Ej: 11 2404 3503' });
    }

    const user = await userModel.updateWhatsAppNumber(req.user.sub, toWhatsAppNumber(raw));
    res.json({
      user,
      whatsapp: {
        number: user.whatsapp_number,
        display: formatWhatsAppDisplay(user.whatsapp_number),
      },
    });
  } catch (err) {
    console.error('updateWhatsApp error:', err);
    res.status(500).json({ error: 'Error al guardar el WhatsApp.' });
  }
}

module.exports = { register, login, me, forgotPassword, resetPassword, updateWhatsApp };
