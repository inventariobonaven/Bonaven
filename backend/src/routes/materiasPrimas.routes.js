// src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();
const materiasPrimasController = require('../controllers/materiasPrimas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

// CRUD - Solo para ADMIN
router.post('/', authenticateToken, authorizeRoles('ADMIN'), materiasPrimasController.crearMateriaPrima);
router.get('/', authenticateToken, authorizeRoles('ADMIN'), materiasPrimasController.listarMateriasPrimas);
router.get('/:id', authenticateToken, authorizeRoles('ADMIN'), materiasPrimasController.obtenerMateriaPrima);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), materiasPrimasController.actualizarMateriaPrima);
router.patch('/:id/estado', authenticateToken, authorizeRoles('ADMIN'), materiasPrimasController.cambiarEstadoMateriaPrima);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), materiasPrimasController.eliminarMateriaPrima);

module.exports = router;



