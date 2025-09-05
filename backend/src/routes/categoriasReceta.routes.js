// src/routes/categoriasReceta.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireRoleAdmin } = require('../middlewares/auth');
const ctrl = require('../controllers/categoriasReceta.controller');

router.use(requireAuth);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.detalle);

router.post('/', requireRoleAdmin, ctrl.crear);
router.put('/:id', requireRoleAdmin, ctrl.actualizar);
router.patch('/:id/estado', requireRoleAdmin, ctrl.toggleEstado);
router.delete('/:id', requireRoleAdmin, ctrl.eliminar);

module.exports = router;



