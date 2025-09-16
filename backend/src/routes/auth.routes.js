const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth');

router.post('/login', authCtrl.login);

function meHandler(req, res) {
  const safeUser = { ...req.user };
  delete safeUser.contrasena;
  res.json({
    user: safeUser,
    role: safeUser?.rol || null,
    roleNorm: safeUser?.rolNorm || null,
    permissions: req.permissions || [],
  });
}

router.get('/me', authenticateToken, meHandler);
router.get('/whoami', authenticateToken, meHandler);

module.exports = router;
