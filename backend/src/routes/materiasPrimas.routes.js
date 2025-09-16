// backend/src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();

const materiasPrimasController = require('../controllers/materiasPrimas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

/**
 * Materias Primas — rutas con permisos por rol.
 * - ADMIN: CRUD completo
 * - PRODUCCION: solo lectura (listar/obtener)
 *
 * Nota: el middleware auth normaliza el rol (sin acentos, mayúsculas),
 * así que el valor esperado en BD es "PRODUCCION" o "ADMIN".
 */

// Crear (solo ADMIN)
router.post(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.crearMateriaPrima,
);

// Listar (ADMIN y PRODUCCION)
router.get(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  materiasPrimasController.listarMateriasPrimas,
);

// Obtener por id (ADMIN y PRODUCCION)
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  materiasPrimasController.obtenerMateriaPrima,
);

// Actualizar (solo ADMIN)
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.actualizarMateriaPrima,
);

// Cambiar estado (solo ADMIN)
router.patch(
  '/:id/estado',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.cambiarEstadoMateriaPrima,
);

// Eliminar (solo ADMIN)
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.eliminarMateriaPrima,
);

module.exports = router;
