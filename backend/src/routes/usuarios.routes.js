// src/routes/usuarios.routes.js
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

// Rutas solo para ADMIN
router.post('/', authenticateToken, authorizeRoles('ADMIN'), usuariosController.createUser);
router.get('/', authenticateToken, authorizeRoles('ADMIN'), usuariosController.listUsers);
router.get('/:id', authenticateToken, authorizeRoles('ADMIN'), usuariosController.getUserById);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), usuariosController.updateUser);
router.patch('/:id/password', authenticateToken, authorizeRoles('ADMIN'), usuariosController.changePassword);
router.patch('/:id/estado', authenticateToken, authorizeRoles('ADMIN'), usuariosController.changeUserState);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), usuariosController.deleteUser);

module.exports = router;



