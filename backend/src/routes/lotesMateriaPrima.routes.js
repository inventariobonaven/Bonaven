// src/routes/lotesMateriaPrima.routes.js
const express = require('express');
const router = express.Router();
const lotesController = require('../controllers/lotesMateriaPrima.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

// CRUD de lotes (solo ADMIN)
router.post('/', authenticateToken, authorizeRoles('ADMIN'), lotesController.crearLote);
router.get('/', authenticateToken, authorizeRoles('ADMIN'), lotesController.listarLotes);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), lotesController.actualizarLote);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), lotesController.eliminarLote);

module.exports = router;


