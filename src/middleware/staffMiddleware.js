const userModel = require('../models/userModel');

function isApprovedStaff(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'photographer' && user.photographer_status === 'approved';
}

function isPublicPhotographer(user) {
  return isApprovedStaff(user);
}

function panelPath(user) {
  if (!user) return 'login.html';
  if (isApprovedStaff(user)) return 'admin.html';
  return 'dashboard.html';
}

async function requireStaff(req, res, next) {
  try {
    const user = await userModel.findById(req.user && req.user.sub);
    if (!user) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    if (user.role === 'photographer' && user.photographer_status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta de fotógrafo todavía no fue aprobada.' });
    }
    if (!isApprovedStaff(user)) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción.' });
    }
    req.account = user;
    next();
  } catch (err) {
    console.error('requireStaff error:', err);
    res.status(500).json({ error: 'Error al validar permisos.' });
  }
}

module.exports = { isApprovedStaff, isPublicPhotographer, panelPath, requireStaff };
