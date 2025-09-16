const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken } = require('../middlewares/auth');

// Helper solo para loguear qué ve el backend
function logWho(req, _res, next) {
  const r = String(req?.user?.rol || '');
  const perms = Array.isArray(req?.permissions) ? req.permissions.join(',') : '';
  console.log(`[MP GUARD] user=${req?.user?.id} rol="${r}" perms=[${perms}]`);
  next();
}

/* ===== CRUD ===== */

// Crear (solo ADMIN) — lo dejamos igual
router.post(
  '/',
  authenticateToken,
  (req, res, next) => {
    if (
      String(req.user?.rol || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') !== 'ADMIN'
    ) {
      return res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
    }
    return next();
  },
  ctrl.crearMateriaPrima,
);

// 🔓 Hotfix: Listar y Obtener -> solo autenticado (y log de rol/permisos)
router.get('/', authenticateToken, logWho, ctrl.listarMateriasPrimas);
router.get('/:id', authenticateToken, logWho, ctrl.obtenerMateriaPrima);

// Actualizar / estado / eliminar (solo ADMIN)
router.put(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    const isAdmin =
      String(req.user?.rol || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.actualizarMateriaPrima,
);

router.patch(
  '/:id/estado',
  authenticateToken,
  (req, res, next) => {
    const isAdmin =
      String(req.user?.rol || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.cambiarEstadoMateriaPrima,
);

router.delete(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    const isAdmin =
      String(req.user?.rol || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.eliminarMateriaPrima,
);

module.exports = router;
