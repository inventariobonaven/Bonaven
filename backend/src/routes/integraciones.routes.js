const { Router } = require('express');
const requireApiKey = require('../middlewares/apiKey');
const controller = require('../controllers/integraciones.controller');

const router = Router();

router.post('/pt/salida', requireApiKey, controller.salidaPTDesdeFactura);

module.exports = router;
