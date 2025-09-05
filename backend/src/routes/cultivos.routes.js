const express = require('express');
const prisma = require('../database/prismaClient');
const ctrl = require('../controllers/cultivos.controller'); // Solo usamos listarCultivos
const { descontarFIFO } = require('../services/fifo.services');

const router = express.Router();

/* ===================== Helpers ===================== */
// Si viene "YYYY-MM-DD", agregamos la hora LOCAL actual (HH:mm:ss).
// Si viene ISO con hora, se respeta.
// Si viene vacío, devolvemos null para que DB use CURRENT_TIMESTAMP.
function normalizeFecha(input) {
  if (!input) return null;
  const s = String(input).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return new Date(`${s}T${hh}:${mm}:${ss}`); // sin 'Z' => hora local
  }

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

async function recalcStockMP(tx, mpId) {
  const sum = await tx.lotes_materia_prima.aggregate({
    where: { materia_prima_id: mpId, estado: { in: ['DISPONIBLE', 'RESERVADO'] } },
    _sum: { cantidad: true }
  });
  await tx.materias_primas.update({
    where: { id: mpId },
    data: { stock_total: sum._sum.cantidad ?? 0 }
  });
}

/* ===================== Endpoints ===================== */

// Listar cultivos (MP con tipo=CULTIVO)
router.get('/', ctrl.listarCultivos);

// Alimentación (descuenta harina) — motivo fijo: ALIMENTACION MASA MADRE
router.post('/:id/feed', async (req, res) => {
  const cultivoId = Number(req.params.id);
  const { fecha, harina_mp_id, harina_cantidad, notas } = req.body || {};

  if (!cultivoId) return res.status(400).json({ message: 'cultivo_id inválido' });
  if (!harina_mp_id || !(Number(harina_cantidad) > 0)) {
    return res.status(400).json({ message: 'harina_mp_id y harina_cantidad son requeridos' });
  }

  try {
    const when = normalizeFecha(fecha); // null => DB pone CURRENT_TIMESTAMP

    const out = await prisma.$transaction(async (tx) => {
      await descontarFIFO(tx, Number(harina_mp_id), Number(harina_cantidad), {
        motivo: 'ALIMENTACION MASA MADRE',
        ref_tipo: 'CULTIVO_FEED',
        ref_id: cultivoId,
        fecha: when || undefined, // undefined => CURRENT_TIMESTAMP
        observacion: (notas && String(notas).trim()) || '',
      });

      await recalcStockMP(tx, Number(harina_mp_id));

      return {
        cultivo_id: cultivoId,
        harina_mp_id: Number(harina_mp_id),
        harina_cantidad: Number(harina_cantidad),
        fecha_usada: when ? when : 'CURRENT_TIMESTAMP',
      };
    });

    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ message: e?.message || 'No se pudo registrar la alimentación' });
  }
});

// Espolvoreo (descuenta harina; no toca stock del cultivo)
router.post('/:id/espolvoreo', async (req, res) => {
  const cultivoId = Number(req.params.id);
  const { fecha, mp_id, cantidad, notas } = req.body || {};

  if (!cultivoId) return res.status(400).json({ message: 'cultivo_id inválido' });
  if (!mp_id || !(Number(cantidad) > 0)) {
    return res.status(400).json({ message: 'mp_id y cantidad son requeridos' });
  }

  try {
    const when = normalizeFecha(fecha);

    const out = await prisma.$transaction(async (tx) => {
      await descontarFIFO(tx, Number(mp_id), Number(cantidad), {
        motivo: 'ESPOLVOREO',
        ref_tipo: 'CULTIVO_ESPOLVOREO',
        ref_id: cultivoId,
        fecha: when || undefined,
        observacion: (notas && String(notas).trim()) || '',
      });

      await recalcStockMP(tx, Number(mp_id));

      return {
        cultivo_id: cultivoId,
        mp_id: Number(mp_id),
        cantidad: Number(cantidad),
        fecha_usada: when ? when : 'CURRENT_TIMESTAMP',
      };
    });

    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ message: e?.message || 'No se pudo registrar el espolvoreo' });
  }
});

// Historial de movimientos del cultivo (para el front si lo necesitas)
router.get('/:id/movimientos', async (req, res) => {
  try {
    const cultivoId = Number(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const rows = await prisma.movimientos_materia_prima.findMany({
      where: { materia_prima_id: cultivoId },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true, tipo: true, cantidad: true, fecha: true, motivo: true,
        ref_tipo: true, ref_id: true, lote_id: true
      }
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;



