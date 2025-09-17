// backend/src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authenticateToken, getPermissionsByRole } = require('../middlewares/auth');

/* --- Diagnóstico rápido --- */
// No requiere token: confirma que esta versión está desplegada
router.get('/__ping', (_req, res) => {
  res.json({
    ok: true,
    route: 'auth',
    time: new Date().toISOString(),
    build: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
});

/* --- Login --- */
router.post('/login', authCtrl.login);

/* --- /me y /whoami comparten handler --- */
function meHandler(req, res) {
  const user = req.user || null;
  const safeUser = user ? { ...user } : null;
  if (safeUser) delete safeUser.contrasena;

  const role = safeUser?.rol || null;
  const roleNorm = safeUser?.rolNorm || null;

  // Si por alguna razón no vino req.permissions, recalcúlalo por rol
  const permissions =
    (Array.isArray(req.permissions) && req.permissions.length && req.permissions) ||
    getPermissionsByRole(role);

  res.json({ user: safeUser, role, roleNorm, permissions });
}

router.get('/me', authenticateToken, meHandler);
router.get('/whoami', authenticateToken, meHandler);

module.exports = router;
