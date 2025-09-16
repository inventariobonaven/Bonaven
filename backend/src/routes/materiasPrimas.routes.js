const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken, authorizeRoles, authorizePermissions } = require('../middlewares/auth');

/** Permite si el usuario cumple alguno:
 *  - rol dentro de la lista
 *  - ó tiene alguno de los permisos requeridos
 */
function allowRolesOrPerms(roles = [], perms = []) {
  const byRole = authorizeRoles(...roles);
  const byPerms = authorizePermissions(...perms);

  return (req, res, next) => {
    byRole(req, res, (err) => {
      if (!err) return next(); // pasó por rol
      byPerms(req, res, (err2) => {
        if (!err2) return next(); // pasó por permiso
        return res.status(403).json({ message: 'No autorizado (rol/permiso)' });
      });
    });
  };
}

/* ===== CRUD ===== */

// Crear (solo ADMIN)
router.post('/', authenticateToken, authorizeRoles('ADMIN'), ctrl.crearMateriaPrima);

// Listar (ADMIN o PRODUCCION o permiso PRODUCCION_VIEW / MATERIAS_MANAGE)
router.get(
  '/',
  authenticateToken,
  allowRolesOrPerms(['ADMIN', 'PRODUCCION'], ['PRODUCCION_VIEW', 'MATERIAS_MANAGE']),
  ctrl.listarMateriasPrimas,
);

// Obtener (ADMIN o PRODUCCION o permiso PRODUCCION_VIEW / MATERIAS_MANAGE)
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
