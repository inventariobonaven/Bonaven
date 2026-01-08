// src/routes/pt.routes.js
const { Router } = require('express');
const ctrl = require('../controllers/pt.controller');

/* ===================== /api/pt ===================== */
const api = Router();

// ENTRADAS de PT (crea/actualiza lote y descuenta bolsas de EMPAQUE)
api.post('/ingresos', ctrl.ingresarPT);

// SALIDAS de PT (ventas) por FIFO o por LOTE; soporta paquetes
api.post('/salidas', ctrl.salidaPT);

// MOVER etapa (CONGELADO -> EMPAQUE | HORNEO)
api.patch('/lotes/:id/etapa', ctrl.moverEtapa);

// 🔸 NUEVO: liberar unidades desde CONGELADO
api.post('/liberacion', ctrl.liberarCongelado);

// Listados
api.get('/lotes', ctrl.listarLotesPT);
api.get('/movimientos', ctrl.listarMovimientosPT);

// ✅ NUEVO (para que ELLOS consulten)
// 1) Consultar lote por IdProduccion (id autoincrement del lote PT)
api.get('/lotes/:id', ctrl.obtenerLotePT);

// 2) Consultar movimientos de un lote (auditoría por IdProduccion)
api.get('/lotes/:id/movimientos', ctrl.movimientosPorLotePT);

// 3) Consultar stock por IdProducto (micomercio_id)
api.get('/stock', ctrl.stockPorMicomercioId);

// Admin de lotes
api.put('/lotes/:id', ctrl.actualizarLote);
api.patch('/lotes/:id/estado', ctrl.toggleEstadoLote);
api.delete('/lotes/:id', ctrl.eliminarLote);

/* ===================== /stock-pt (ALIAS para el Front) ===================== */
const alias = Router();

// NOMBRES que usa tu UI:
alias.post('/ingreso', ctrl.ingresarPT); // singular
alias.post('/salida', ctrl.salidaPT); // singular
alias.patch('/lotes/:id/etapa', ctrl.moverEtapa);

// 🔸 NUEVO alias de liberación
alias.post('/liberacion', ctrl.liberarCongelado);

alias.get('/lotes', ctrl.listarLotesPT);
alias.get('/movimientos', ctrl.listarMovimientosPT);

// ✅ ALIAS (opcional, por si quieres también exponerlo al front)
alias.get('/lotes/:id', ctrl.obtenerLotePT);
alias.get('/lotes/:id/movimientos', ctrl.movimientosPorLotePT);
alias.get('/stock', ctrl.stockPorMicomercioId);

alias.put('/lotes/:id', ctrl.actualizarLote);
alias.patch('/lotes/:id/estado', ctrl.toggleEstadoLote);
alias.delete('/lotes/:id', ctrl.eliminarLote);

module.exports = { api, alias };
