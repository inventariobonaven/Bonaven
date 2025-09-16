// backend/src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();
const materiasPrimasController = require('../controllers/materiasPrimas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

// Crear (solo ADMIN)
router.post(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.crearMateriaPrima,
);

// LISTAR y OBTENER (ADMIN **y** PRODUCCION)  ← ← AQUÍ ESTÁ LA CLAVE
router.get(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  materiasPrimasController.listarMateriasPrimas,
);

router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  materiasPrimasController.obtenerMateriaPrima,
);

// Actualizar / estado / eliminar (solo ADMIN)
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.actualizarMateriaPrima,
);

router.patch(
  '/:id/estado',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.cambiarEstadoMateriaPrima,
);

router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  materiasPrimasController.eliminarMateriaPrima,
);

module.exports = router;
