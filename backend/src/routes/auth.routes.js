// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authenticateToken, getPermissionsByRole } = require('../middlewares/auth');

router.post('/login', authCtrl.login);

router.get('/me', authenticateToken, (req, res) => {
  const { contrasena, ...userSafe } = req.user;
  res.json({ user: userSafe, permissions: getPermissionsByRole(userSafe.rol) });
});

module.exports = router;



