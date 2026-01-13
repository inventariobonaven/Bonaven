const { Router } = require('express');
const requireApiKey = require('../middlewares/apiKey');
const controller = require('../controllers/integraciones.controller');
const { requireAuth, requireRoleAdmin } = require('../middlewares/auth');

const router = Router();

router.post('/pt/salida', requireApiKey, controller.salidaPTDesdeFactura);

// ✅ retry desde el sistema (admin logueado)
router.post('/outbox/:outboxId/retry', requireAuth, requireRoleAdmin, controller.retryOutboxById);

module.exports = router;
