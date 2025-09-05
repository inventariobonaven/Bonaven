const { Router } = require('express');
const {
  registrarProduccion,
  calcularProduccion,
  listarProducciones,
  detalleProduccion,
  insumosProduccion, // 👈 tooltip insumos
} = require('../controllers/produccion.controller');

const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = Router();

// Simular (cálculo) — NO altera BD
router.post(
  '/calcular',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  calcularProduccion
);

// Registrar producción — descuenta MP FIFO y genera lotes PT (etapa según producto)
router.post(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  registrarProduccion
);

// Listar producciones (historial)
router.get(
  '/',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  listarProducciones
);

// Detalle de una producción
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  detalleProduccion
);

// Insumos usados por una producción (para tooltip/hover en historial)
router.get(
  '/:id/insumos',
  authenticateToken,
  authorizeRoles('ADMIN', 'PRODUCCION'),
  insumosProduccion
);

module.exports = router;



