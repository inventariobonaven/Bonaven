// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth');

router.post('/login', authCtrl.login);

// Handler reutilizable para /me y /whoami
function meHandler(req, res) {
  // authenticateToken ya cargó req.user (con rolNorm) y req.permissions
  const safeUser = { ...req.user };
  delete safeUser.contrasena; // nunca exponer

  res.json({
    user: safeUser,
    role: safeUser?.rol || null,
    roleNorm: safeUser?.rolNorm || null,
    permissions: req.permissions || [],
  });
}

// Quién soy (útil para depurar roles/permisos en producción)
router.get('/me', authenticateToken, meHandler);
router.get('/whoami', authenticateToken, meHandler);

module.exports = router;
