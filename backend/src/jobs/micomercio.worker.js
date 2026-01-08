// src/jobs/micomercio.worker.js
const prisma = require('../database/prismaClient');
const { pickPending, markSent, markError, backoffMs } = require('../services/outbox.service');
const { postIngreso } = require('../services/micomercio.services');

const TIPO_INGRESO = 'INGRESO_PT';

function buildIngresoPayload(row) {
  // row.payload ya debe venir en el formato que exige MiComercio
  return row.payload;
}

async function processRow(row) {
  if (row.tipo !== TIPO_INGRESO) {
    // si en el futuro agregas más tipos, aquí se enrutan
    throw new Error(`Tipo outbox no soportado: ${row.tipo}`);
  }

  const payload = buildIngresoPayload(row);
  const result = await postIngreso(payload);

  return result; // {status, data}
}

async function runOnce({ limit = 10 } = {}) {
  const rows = await pickPending(limit);
  if (!rows.length) return { picked: 0, sent: 0 };

  let sent = 0;

  for (const row of rows) {
    try {
      const { status, data } = await processRow(row);
      await markSent(row.id, status, data);
      sent++;
      console.log(`[MiComercio] ENVIADO outbox#${row.id} ref_id=${row.ref_id} status=${status}`);
    } catch (err) {
      const status = err.status ?? null;
      const resp = err.response ?? null;
      const nextRunAt = new Date(Date.now() + backoffMs(row.intentos));

      await markError(row.id, status, err.message, resp, nextRunAt);

      console.error(
        `[MiComercio] ERROR outbox#${row.id} ref_id=${row.ref_id} status=${status} msg=${err.message}`,
      );
    }
  }

  return { picked: rows.length, sent };
}

let timer = null;

function startWorker({ everyMs = 10_000 } = {}) {
  if (timer) return;

  console.log(`[MiComercio] worker ON cada ${everyMs / 1000}s`);
  timer = setInterval(() => {
    runOnce({ limit: 10 }).catch((e) => console.error('[MiComercio] runOnce fatal', e));
  }, everyMs);
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startWorker, stopWorker, runOnce };
