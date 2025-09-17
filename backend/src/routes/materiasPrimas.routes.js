// backend/src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

/* ============ Diags (útiles en prod) ============ */
// No requiere token: confirma que esta versión está desplegada
router.get('/__ping', (_req, res) => {
  res.json({
    ok: true,
    route: 'materias-primas',
    time: new Date().toISOString(),
    build: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
});

// Requiere token: ver qué usuario/rol/permisos llegan al backend
router.get('/__debug', authenticateToken, (req, res) => {
  res.json({
    user: req.user || null,
    role: req.user?.rol || null,
    roleNorm: req.user?.rolNorm || null,
    permissions: req.permissions || [],
    authzHeader: req.headers.authorization || req.headers.Authorization || null,
  });
});

/* ============ Reglas ============ */
/*
 * ADMIN y PRODUCCION pueden LISTAR / OBTENER.
 * Solo ADMIN puede CREAR / ACTUALIZAR / CAMBIAR ESTADO / ELIMINAR.
 */

// Crear (solo ADMIN)
router.post('/', authenticateToken, authorizeRoles('ADMIN'), ctrl.crearMateriaPrima);

// Listar (ADMIN o PRODUCCION) ← usa Cultivos
router.get(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  ctrl.listarMateriasPrimas,
);

// Obtener por id (ADMIN o PRODUCCION)
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  ctrl.obtenerMateriaPrima,
);

// Actualizar (solo ADMIN)
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), ctrl.actualizarMateriaPrima);

// Cambiar estado (solo ADMIN)
router.patch(
  '/:id/estado',
  authenticateToken,
  authorizeRoles('ADMIN'),
  ctrl.cambiarEstadoMateriaPrima,
);

// Eliminar (solo ADMIN)
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), ctrl.eliminarMateriaPrima);

module.exports = router;
