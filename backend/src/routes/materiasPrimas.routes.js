// backend/src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken } = require('../middlewares/auth');

// Log de quién llega (útil en Render)
function logWho(req, _res, next) {
  const r = String(req?.user?.rol || '');
  const perms = Array.isArray(req?.permissions) ? req.permissions.join(',') : '';
  console.log(`[MP GUARD] user=${req?.user?.id} rol="${r}" perms=[${perms}]`);
  next();
}

/* ====== Rutas ====== */

// 🔓 GET: solo autenticado (sin chequear rol) + log
router.get('/', authenticateToken, logWho, ctrl.listarMateriasPrimas);
router.get('/:id', authenticateToken, logWho, ctrl.obtenerMateriaPrima);

// POST/PUT/PATCH/DELETE: solo ADMIN (mantenemos las restricciones)
function requireAdmin(req, res, next) {
  const isAdmin =
    String(req.user?.rol || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') === 'ADMIN';
  return isAdmin ? next() : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
}

router.post('/', authenticateToken, requireAdmin, ctrl.crearMateriaPrima);
router.put('/:id', authenticateToken, requireAdmin, ctrl.actualizarMateriaPrima);
router.patch('/:id/estado', authenticateToken, requireAdmin, ctrl.cambiarEstadoMateriaPrima);
router.delete('/:id', authenticateToken, requireAdmin, ctrl.eliminarMateriaPrima);

module.exports = router;
