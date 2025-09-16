const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken } = require('../middlewares/auth');

/** 🔔 Banner de versión y “ping” */
console.log('[MP ROUTES] v=mp-read-authenticated-v3');

/** Log rápido para Render */
function logWho(req, _res, next) {
  const r = String(req?.user?.rol || '');
  const rn = String(req?.user?.rolNorm || '');
  const perms = Array.isArray(req?.permissions) ? req.permissions.join(',') : '';
  console.log(
    `[MP ROUTE] uid=${req?.user?.id} rol="${r}" rolNorm=${rn} perms=[${perms}] ${req.method} ${req.originalUrl}`,
  );
  next();
}

/** Ruta de diagnóstico (ver que este archivo esté activo) */
router.get('/__ping', (_req, res) => {
  res.json({ ok: true, route: 'materiasPrimas', version: 'mp-read-authenticated-v3' });
});

/* ===== CRUD ===== */

/** Crear (solo ADMIN) */
router.post(
  '/',
  authenticateToken,
  (req, res, next) => {
    const isAdmin = String(req.user?.rolNorm || req.user?.rol || '').toUpperCase() === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.crearMateriaPrima,
);

/** 🔓 Listar (cualquier autenticado) */
router.get('/', authenticateToken, logWho, ctrl.listarMateriasPrimas);

/** 🔓 Obtener (cualquier autenticado) */
router.get('/:id', authenticateToken, logWho, ctrl.obtenerMateriaPrima);

/** Actualizar (solo ADMIN) */
router.put(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    const isAdmin = String(req.user?.rolNorm || req.user?.rol || '').toUpperCase() === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.actualizarMateriaPrima,
);

/** Cambiar estado (solo ADMIN) */
router.patch(
  '/:id/estado',
  authenticateToken,
  (req, res, next) => {
    const isAdmin = String(req.user?.rolNorm || req.user?.rol || '').toUpperCase() === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.cambiarEstadoMateriaPrima,
);

/** Eliminar (solo ADMIN) */
router.delete(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    const isAdmin = String(req.user?.rolNorm || req.user?.rol || '').toUpperCase() === 'ADMIN';
    return isAdmin
      ? next()
      : res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
  },
  ctrl.eliminarMateriaPrima,
);

module.exports = router;
