// src/routes/productos.routes.js
const { Router } = require('express');
const router = Router();

const ctrl = require('../controllers/productos.controller');
// const { requireAuth, requireRoleAdmin } = require('../middlewares/auth');

// router.use(requireAuth);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.detalle);
router.post('/', /* requireRoleAdmin, */ ctrl.crear);
router.put('/:id', /* requireRoleAdmin, */ ctrl.actualizar);
router.delete('/:id', /* requireRoleAdmin, */ ctrl.eliminar);
router.patch('/:id/estado', /* requireRoleAdmin, */ ctrl.toggleEstado);

module.exports = router;



