// src/routes/movimientosMateriaPrima.routes.js
const { Router } = require('express');
const {
  listarMovimientos,
  crearAjuste,
} = require('../controllers/movimientosMateriaPrima.controller');

// Si quieres proteger con auth, descomenta estas dos líneas:
// const { requireAuth } = require('../middlewares/auth');
// const { requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

console.log('[Routes] movimientos-mp cargado');

router.get('/', /* requireAuth, */ listarMovimientos);
router.post('/ajuste', /* requireAuth, requireAdmin, */ crearAjuste);

// Health local del router para debug
router.get('/__ping', (req, res) => res.json({ ok: true, scope: 'movimientos-mp' }));

module.exports = router;



