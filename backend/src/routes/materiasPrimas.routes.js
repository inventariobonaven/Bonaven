const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken, authorizeRoles, authorizePermissions } = require('../middlewares/auth');

/**
 * Helper: permite si el usuario cumple alguno de:
 *  - rol dentro de la lista permitida
 *  - permisos finos dentro de la lista requerida
 */
function allowRolesOrPerms(roles = [], perms = []) {
  // Reutiliza los middlewares existentes
  const byRole = authorizeRoles(...roles);
  const byPerms = authorizePermissions(...perms);

  return (req, res, next) => {
    // intentamos por rol
    byRole(req, res, (err) => {
      if (!err) return next(); // pasó por rol

      // si falló por rol, probamos por permisos
      byPerms(req, res, (err2) => {
        if (!err2) return next(); // pasó por permisos

        // si no pasó, devolvemos 403 con info mínima (útil para debugging)
        return res.status(403).json({
          message: 'No autorizado (rol/permiso)',
          // comenta estas dos líneas si no quieres pistas en producción:
          // role: req.user?.rol,
          // permissions: req.permissions || [],
        });
      });
    });
  };
}

/* ================== RUTAS ================== */

// Crear (solo ADMIN)
router.post('/', authenticateToken, authorizeRoles('ADMIN'), ctrl.crearMateriaPrima);

// Listar (ADMIN o PRODUCCION o permiso PRODUCCION_VIEW/MATERIAS_MANAGE)
router.get(
  '/',
  authenticateToken,
  allowRolesOrPerms(['ADMIN', 'PRODUCCION'], ['PRODUCCION_VIEW', 'MATERIAS_MANAGE']),
  ctrl.listarMateriasPrimas,
);

// Obtener por id (ADMIN o PRODUCCION o permiso PRODUCCION_VIEW/MATERIAS_MANAGE)
router.get(
  '/:id',
  authenticateToken,
  allowRolesOrPerms(['ADMIN', 'PRODUCCION'], ['PRODUCCION_VIEW', 'MATERIAS_MANAGE']),
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
