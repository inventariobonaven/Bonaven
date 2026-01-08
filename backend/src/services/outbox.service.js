// src/services/outbox.service.js
const prisma = require('../database/prismaClient');

const PROVEEDOR = 'MICOMERCIO';

async function enqueueOutbox(tx, { tipo, ref_id, payload }) {
  // tx = prisma transaction client
  // upsert por unique(proveedor, tipo, ref_id)
  return tx.integracion_outbox.upsert({
    where: {
      uq_outbox_micomercio_ref: {
        proveedor: PROVEEDOR,
        tipo,
        ref_id: Number(ref_id),
      },
    },
    create: {
      proveedor: PROVEEDOR,
      tipo,
      ref_id: Number(ref_id),
      payload,
      estado: 'PENDIENTE',
      intentos: 0,
      next_run_at: new Date(),
    },
    update: {
      payload, // si ya existía, actualiza payload
      estado: 'PENDIENTE',
      // no reinicio intentos (para no esconder fallos)
      next_run_at: new Date(),
      last_error: null,
      last_status: null,
      last_resp: null,
      updated_at: new Date(),
    },
  });
}

async function markSent(id, status, respJson) {
  return prisma.integracion_outbox.update({
    where: { id },
    data: {
      estado: 'ENVIADO',
      last_status: status ?? null,
      last_resp: respJson ?? null,
      last_error: null,
      updated_at: new Date(),
    },
  });
}

async function markError(id, status, errorMsg, respJson, nextRunAt) {
  return prisma.integracion_outbox.update({
    where: { id },
    data: {
      estado: 'ERROR',
      intentos: { increment: 1 },
      last_status: status ?? null,
      last_error: String(errorMsg || 'Error desconocido'),
      last_resp: respJson ?? null,
      next_run_at: nextRunAt ?? new Date(Date.now() + 60_000),
      updated_at: new Date(),
    },
  });
}

async function pickPending(limit = 10) {
  return prisma.integracion_outbox.findMany({
    where: {
      proveedor: PROVEEDOR,
      estado: { in: ['PENDIENTE', 'ERROR'] },
      next_run_at: { lte: new Date() },
    },
    orderBy: [{ next_run_at: 'asc' }, { id: 'asc' }],
    take: limit,
  });
}

function backoffMs(intentos) {
  // 0->10s, 1->30s, 2->1m, 3->2m, 4->5m, 5->10m (máx 10m)
  const n = Number(intentos || 0);
  const table = [10_000, 30_000, 60_000, 120_000, 300_000, 600_000];
  return table[Math.min(n, table.length - 1)];
}

module.exports = {
  enqueueOutbox,
  markSent,
  markError,
  pickPending,
  backoffMs,
};
