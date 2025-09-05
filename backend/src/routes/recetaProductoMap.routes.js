const { Router } = require('express');
const ctrl = require('../controllers/recetaProductoMap.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const r = Router();

r.get('/:id/productos-map', authenticateToken, authorizeRoles('ADMIN'), ctrl.listarPorReceta);
r.post('/:id/productos-map', authenticateToken, authorizeRoles('ADMIN'), ctrl.crear);

r.put('/productos-map/:mapId', authenticateToken, authorizeRoles('ADMIN'), ctrl.actualizar);
r.delete('/productos-map/:mapId', authenticateToken, authorizeRoles('ADMIN'), ctrl.eliminar);

module.exports = r;



