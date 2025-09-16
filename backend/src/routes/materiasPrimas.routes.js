// backend/src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken } = require('../middlewares/auth');

/* ============ Helpers ============ */
function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}
function isAdmin(req) {
  return norm(req?.user?.rol) === 'ADMIN';
}

/* ============ Diagnóstico rápido (¡deja esto!) ============ */
// NO requiere token: sirve para confirmar que el código nuevo sí está desplegado
router.get('/__ping', (_req, res) => {
  res.json({
    ok: true,
    route: 'materias-primas',
    time: new Date().toISOString(),
    build: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
});

// Requiere token: muestra qué usuario/rol/permisos llegan al backend
router.get('/__debug', authenticateToken, (req, res) => {
  res.json({
    user: req.user || null,
    role: req.user?.rol || null,
    roleNorm: norm(req.user?.rol),
    permissions: req.permissions || [],
    authzHeader: req.headers['authorization'] || req.headers['Authorization'] || null,
  });
});

/* ============ Reglas ============ */
/*
 * REGLA: PRODUCCION y ADMIN pueden LISTAR/VER MPs.
 *        Solo ADMIN puede crear/editar/cambiar estado/eliminar.
 */

// Crear (solo ADMIN)
router.post(
  '/',
  authenticateToken,
  (req, res, next) => {
    if (!isAdmin(req))
      return res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
    next();
  },
  ctrl.crearMateriaPrima,
);

// Listar (ADMIN o PRODUCCION)  ← ESTA ES LA QUE NECESITA CULTIVOS
router.get('/', authenticateToken, ctrl.listarMateriasPrimas);

// Obtener por id (ADMIN o PRODUCCION)
router.get('/:id', authenticateToken, ctrl.obtenerMateriaPrima);

// Actualizar (solo ADMIN)
router.put(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    if (!isAdmin(req))
      return res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
    next();
  },
  ctrl.actualizarMateriaPrima,
);

// Cambiar estado (solo ADMIN)
router.patch(
  '/:id/estado',
  authenticateToken,
  (req, res, next) => {
    if (!isAdmin(req))
      return res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
    next();
  },
  ctrl.cambiarEstadoMateriaPrima,
);

// Eliminar (solo ADMIN)
router.delete(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    if (!isAdmin(req))
      return res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
    next();
  },
  ctrl.eliminarMateriaPrima,
);

module.exports = router;
