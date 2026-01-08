const { Router } = require('express');
const prisma = require('../database/prismaClient');
const { tick } = require('../jobs/micomercio.worker');

const r = Router();

// Ver cola
r.get('/outbox', async (_req, res) => {
  const rows = await prisma.integracion_outbox.findMany({
    where: { proveedor: 'MICOMERCIO' },
    orderBy: [{ id: 'desc' }],
    take: 50,
  });
  res.json(rows);
});

// Forzar procesamiento ahora (útil en pruebas)
r.post('/run', async (_req, res) => {
  const results = await tick(10);
  res.json({ ok: true, results });
});

// Reintentar uno
r.post('/retry/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = await prisma.integracion_outbox.update({
    where: { id },
    data: { estado: 'PENDIENTE', next_run_at: new Date() },
  });
  res.json({ ok: true, row });
});

module.exports = r;
