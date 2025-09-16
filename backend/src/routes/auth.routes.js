const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/auth.controller');
const { authenticateToken, getPermissionsByRole } = require('../middlewares/auth');

router.post('/login', authCtrl.login);

function meHandler(req, res) {
  const user = req.user || {};
  const safeUser = {
    id: user.id ?? null,
    usuario: user.usuario ?? null,
    nombre: user.nombre ?? null,
    rol: user.rol ?? null,
    estado: user.estado ?? null,
    rolNorm: user.rolNorm ?? (user.rol ? String(user.rol).toUpperCase() : null),
  };
  const permissions =
    Array.isArray(req.permissions) && req.permissions.length
      ? req.permissions
      : getPermissionsByRole(safeUser.rol);

  res.json({ user: safeUser, permissions });
}

router.get('/me', authenticateToken, meHandler);
router.get('/whoami', authenticateToken, meHandler);

module.exports = router;
