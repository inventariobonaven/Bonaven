// src/routes/stockPT.routes.js
const { Router } = require('express');
const ctrl = require('../controllers/pt.controller');
const r = Router();

console.log('[stockPT.routes] montando /api/stock-pt');

r.get('/lotes', ctrl.listarLotesPT);
r.post('/ingreso', ctrl.ingresarPT);
r.put('/lotes/:id', ctrl.actualizarLote);
r.patch('/lotes/:id/estado', ctrl.toggleEstadoLote);
r.delete('/lotes/:id', ctrl.eliminarLote);
r.post('/salida', ctrl.salidaPT);
r.get('/movimientos', ctrl.listarMovimientosPT);
r.patch('/lotes/:id/etapa', ctrl.moverEtapa);

module.exports = r;
