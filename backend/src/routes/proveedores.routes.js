// src/routes/proveedores.routes.js
const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedores.controller');
const { authenticateToken, authorizePermissions } = require('../middlewares/auth');


// CRUD - Solo para quienes tengan el permiso PROVEEDORES_MANAGE
router.post('/', authenticateToken, authorizePermissions('PROVEEDORES_MANAGE'), proveedoresController.crearProveedor);
router.get('/', authenticateToken, authorizePermissions('PROVEEDORES_MANAGE'), proveedoresController.listarProveedores);
router.get('/:id', authenticateToken, authorizePermissions('PROVEEDORES_MANAGE'), proveedoresController.obtenerProveedor);
router.put('/:id', authenticateToken, authorizePermissions('PROVEEDORES_MANAGE'), proveedoresController.actualizarProveedor);
router.patch('/:id/estado', authenticateToken, authorizePermissions('PROVEEDORES_MANAGE'), proveedoresController.cambiarEstadoProveedor);
router.delete('/:id', authenticateToken, authorizePermissions('PROVEEDORES_MANAGE'), proveedoresController.eliminarProveedor);


module.exports = router;





