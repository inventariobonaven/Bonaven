const { Router } = require('express');
const ctrl = require('../controllers/empaques.controller');
const r = Router();

r.post('/', ctrl.crearEmpaque);
r.get('/', ctrl.listarEmpaques);

// ✅ dos maneras de crear lote:
// a) por id en la ruta (ya estaba)
r.post('/:id/ingresos', ctrl.ingresarLote);
// b) por materia_prima_id en el body (para tu formulario genérico)
r.post('/lotes', ctrl.ingresarLote);

r.get('/:id/lotes', ctrl.listarLotes);
r.get('/:id/movimientos', ctrl.listarMovimientos);

module.exports = r;


