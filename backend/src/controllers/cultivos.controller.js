// src/controllers/cultivos.controller.js
const prisma = require('../database/prismaClient');

/* Helpers */
const toM   = (v) => Math.round(Number(v) * 1000);
const fromM = (m) => (m / 1000).toFixed(3);
const subM  = (a, b) => a - b;

const recalcStockMP = async (tx, mpId) => {
  const sum = await tx.lotes_materia_prima.aggregate({
    where: { materia_prima_id: mpId, estado: { in: ['DISPONIBLE', 'RESERVADO'] } },
    _sum: { cantidad: true }
  });
  await tx.materias_primas.update({
    where: { id: mpId },
    data: { stock_total: sum._sum.cantidad ?? 0 }
  });
};

// Descuento FIFO real de una MP (por lotes) y crea movimientos SALIDA
async function consumirMPFIFO(tx, mpId, cantidadStr, meta = {}) {
  let restanteM = toM(cantidadStr);
  if (!(restanteM > 0)) return;

  const lotes = await tx.lotes_materia_prima.findMany({
    where: { materia_prima_id: mpId, estado: 'DISPONIBLE', cantidad: { gt: 0 } },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }]
  });

  for (const lote of lotes) {
    if (restanteM <= 0) break;
    const dispM = toM(lote.cantidad);
    const usarM = Math.min(dispM, restanteM);
    if (usarM > 0) {
      const nuevaM = subM(dispM, usarM);
      await tx.lotes_materia_prima.update({
        where: { id: lote.id },
        data: { cantidad: fromM(nuevaM), estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE' }
      });
      await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'SALIDA',
          materia_prima_id: mpId,
          lote_id: lote.id,
          cantidad: fromM(usarM),
          motivo: meta.motivo || 'Alimentación Masa Madre',
          ref_tipo: meta.ref_tipo || 'Masa Madre',
          ref_id: meta.ref_id ?? null,
          fecha: meta.fecha || new Date(),
          usuario_id: meta.usuario_id ?? null,
        }
      });
      restanteM -= usarM;
    }
  }
  if (restanteM > 0) throw new Error(`Stock insuficiente de MP #${mpId}. Faltan ${fromM(restanteM)}`);
}

/* ============ CONTROLADORES ============ */

// GET /api/cultivos
exports.listarCultivos = async (_req, res) => {
  try {
    const cultivos = await prisma.materias_primas.findMany({
      where: { tipo: 'CULTIVO', estado: true },
      select: { id: true, nombre: true, unidad_medida: true, stock_total: true, estado: true },
      orderBy: [{ nombre: 'asc' }]
    });
    res.json(cultivos);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * POST /api/cultivos/:id/feed
 * body: { fecha?, harina_mp_id, harina_cantidad, notas? }
 * - SOLO descuenta harina (movimiento SALIDA), sin agua y sin tocar stock del cultivo
 * - motivo: "Alimentacion Masa Madre"
 */
exports.alimentarCultivo = async (req, res) => {
  const cultivoId = Number(req.params.id);
  const { fecha, harina_mp_id, harina_cantidad, notas } = req.body || {};

  if (!cultivoId) return res.status(400).json({ message: 'cultivo_id inválido' });
  if (!harina_mp_id || !(Number(harina_cantidad) > 0)) {
    return res.status(400).json({ message: 'harina_mp_id y harina_cantidad > 0 son requeridos' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      // validar cultivo
      const cultivo = await tx.materias_primas.findUnique({
        where: { id: cultivoId },
        select: { id: true, nombre: true, tipo: true, estado: true }
      });
      if (!cultivo || cultivo.tipo !== 'CULTIVO' || cultivo.estado === false) {
        throw new Error('Cultivo no encontrado o inactivo');
      }

      const when = fecha ? new Date(fecha) : new Date();

      // SALIDA harina (FIFO real)
      await consumirMPFIFO(tx, Number(harina_mp_id), String(harina_cantidad), {
        motivo: 'Alimentacion Masa Madre',
        ref_tipo: 'CULTIVO_FEED',
        fecha: when,
      });
      await recalcStockMP(tx, Number(harina_mp_id));

      return {
        cultivo: { id: cultivoId, nombre: cultivo.nombre },
        harina_mp_id: Number(harina_mp_id),
        harina_cantidad: Number(harina_cantidad).toFixed(3),
        fecha: when,
        notas: notas?.trim() || null,
      };
    });

    res.json(out);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/**
 * POST /api/cultivos/:id/espolvoreo
 * body: { fecha?, mp_id, cantidad, notas? }
 * - Descuenta harina para espolvoreo (SALIDA), NO toca stock del cultivo
 * - motivo: "Espolvoreo"
 */
exports.espolvoreoCultivo = async (req, res) => {
  const cultivoId = Number(req.params.id);
  const { fecha, mp_id, cantidad, notas } = req.body || {};

  if (!cultivoId) return res.status(400).json({ message: 'cultivo_id inválido' });
  if (!mp_id || !(Number(cantidad) > 0)) {
    return res.status(400).json({ message: 'mp_id y cantidad > 0 son requeridos' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      // validar cultivo
      const cultivo = await tx.materias_primas.findUnique({
        where: { id: cultivoId },
        select: { id: true, nombre: true, tipo: true, estado: true }
      });
      if (!cultivo || cultivo.tipo !== 'CULTIVO' || cultivo.estado === false) {
        throw new Error('Cultivo no encontrado o inactivo');
      }

      const when = fecha ? new Date(fecha) : new Date();

      // SALIDA harina espolvoreo (FIFO real)
      await consumirMPFIFO(tx, Number(mp_id), String(cantidad), {
        motivo: 'Espolvoreo',
        ref_tipo: 'ESPOLVOREO',
        fecha: when,
      });
      await recalcStockMP(tx, Number(mp_id));

      return {
        cultivo: { id: cultivoId, nombre: cultivo.nombre },
        mp_id: Number(mp_id),
        cantidad: Number(cantidad).toFixed(3),
        fecha: when,
        notas: notas?.trim() || null,
      };
    });

    res.json(out);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/**
 * POST /api/cultivos/:id/ajuste
 * body: { fecha?, cantidad, motivo? }
 * - Ajusta manualmente el stock del cultivo (si lo quieres usar)
 */
exports.ajustarCultivo = async (req, res) => {
  const cultivoId = Number(req.params.id);
  const { cantidad, fecha, motivo } = req.body || {};
  if (!cultivoId) return res.status(400).json({ message: 'cultivo_id inválido' });

  try {
    const out = await prisma.$transaction(async (tx) => {
      const cultivo = await tx.materias_primas.findUnique({
        where: { id: cultivoId },
        select: { id: true, nombre: true, tipo: true, estado: true, stock_total: true }
      });
      if (!cultivo || cultivo.tipo !== 'CULTIVO' || cultivo.estado === false) {
        throw new Error('Cultivo no encontrado o inactivo');
      }

      // Para no complicar con lote virtual, hacemos un simple movimiento de ajuste en MP (sin lote)
      const delta = Number(cantidad || 0);
      if (delta === 0) return { ok: true, sin_cambios: true };

      const when = fecha ? new Date(fecha) : new Date();

      // Creamos movimiento de MP (sin lote) para auditar el ajuste
      await tx.movimientos_materia_prima.create({
        data: {
          tipo: delta > 0 ? 'ENTRADA' : 'SALIDA',
          materia_prima_id: cultivoId,
          lote_id: null,
          cantidad: Math.abs(delta).toFixed(3),
          motivo: motivo || 'AJUSTE',
          ref_tipo: 'AJUSTE',
          fecha: when,
        },
      });

      // Ajustar stock_total directamente
      const nuevo = (Number(cultivo.stock_total) + delta).toFixed(3);
      await tx.materias_primas.update({
        where: { id: cultivoId },
        data: { stock_total: nuevo },
      });

      return { cultivo: { id: cultivoId, nombre: cultivo.nombre }, cantidad_final: nuevo };
    });

    res.json(out);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};



