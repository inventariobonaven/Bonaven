// backend/src/routes/empaques.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/empaques.controller');
const { authenticateToken } = require('../middlewares/auth');

const norm = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
const isAdmin = (req) => norm(req?.user?.rol) === 'ADMIN';

/* 🔐 Todo el módulo de Empaques es SOLO para ADMIN */
router.use(authenticateToken, (req, res, next) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'No autorizado (ADMIN)' });
  next();
});

/* (opcional) ping */
router.get('/__ping', (_req, res) =>
  res.json({ ok: true, route: 'empaques', time: new Date().toISOString() }),
);

/* Empaques (maestro) */
router.post('/', ctrl.crearEmpaque);
router.get('/', ctrl.listarEmpaques);
router.get('/:id', ctrl.obtenerEmpaque);
router.put('/:id', ctrl.actualizarEmpaque);
router.patch('/:id/estado', ctrl.cambiarEstadoEmpaque);
router.delete('/:id', ctrl.eliminarEmpaque);

/* Lotes de empaque */
router.post('/:id/ingresos', ctrl.ingresarLote);
router.post('/lotes', ctrl.ingresarLote); // alternativa por body.materia_prima_id
router.get('/:id/lotes', ctrl.listarLotes);
router.get('/:id/movimientos', ctrl.listarMovimientos);

module.exports = router;
