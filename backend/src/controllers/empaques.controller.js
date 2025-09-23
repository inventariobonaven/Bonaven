// backend/src/controllers/empaques.controller.js
const prisma = require('../database/prismaClient');

/* ===== helpers ===== */
const ESTADOS = ['DISPONIBLE', 'RESERVADO', 'AGOTADO', 'VENCIDO', 'INACTIVO'];
const validEstado = (s) => ESTADOS.includes(String(s || '').toUpperCase());
const norm = (s) => String(s || '').trim();

/** Fecha “solo día” → Date fijada a las 12:00 UTC para evitar corrimientos */
function parseDateOnlyUTC(v) {
  if (!v) return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12, 0, 0));
  }

  const s = String(v).trim();

  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }

  // "MM/DD/YYYY"
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [mm, dd, yyyy] = s.split('/').map(Number);
    return new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  }
  return null;
}

const recalcStockMP = async (tx, mpId) => {
  const sum = await tx.lotes_materia_prima.aggregate({
    where: { materia_prima_id: mpId, estado: { in: ['DISPONIBLE', 'RESERVADO'] } },
    _sum: { cantidad: true },
  });
  await tx.materias_primas.update({
    where: { id: mpId },
    data: { stock_total: sum._sum.cantidad ?? 0 },
  });
};

/* ===== Empaque (maestro) ===== */

exports.crearEmpaque = async (req, res) => {
  try {
    const { nombre, unidad_medida = 'ud', estado = true } = req.body;
    if (!norm(nombre)) return res.status(400).json({ message: 'nombre requerido' });

    // evita duplicados por nombre (case-insensitive) dentro de EMPAQUE
    const dup = await prisma.materias_primas.findFirst({
      where: {
        tipo: 'EMPAQUE',
        nombre: { equals: norm(nombre), mode: 'insensitive' },
      },
    });
    if (dup) return res.status(409).json({ message: 'Ya existe un empaque con ese nombre' });

    const mp = await prisma.materias_primas.create({
      data: {
        nombre: norm(nombre),
        tipo: 'EMPAQUE',
        unidad_medida: norm(unidad_medida),
        estado: !!estado,
      },
    });
    res.status(201).json(mp);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.listarEmpaques = async (_req, res) => {
  try {
    const list = await prisma.materias_primas.findMany({
      where: { tipo: 'EMPAQUE' },
      orderBy: [{ estado: 'desc' }, { nombre: 'asc' }],
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.obtenerEmpaque = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const mp = await prisma.materias_primas.findFirst({
      where: { id, tipo: 'EMPAQUE' },
    });
    if (!mp) return res.status(404).json({ message: 'Empaque no encontrado' });
    res.json(mp);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.actualizarEmpaque = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.materias_primas.findFirst({
      where: { id, tipo: 'EMPAQUE' },
    });
    if (!current) return res.status(404).json({ message: 'Empaque no encontrado' });

    const { nombre, unidad_medida, estado } = req.body;

    if (typeof nombre === 'string' && norm(nombre).toLowerCase() !== current.nombre.toLowerCase()) {
      const dup = await prisma.materias_primas.findFirst({
        where: {
          tipo: 'EMPAQUE',
          nombre: { equals: norm(nombre), mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (dup) return res.status(409).json({ message: 'Ya existe otro empaque con ese nombre' });
    }

    const upd = await prisma.materias_primas.update({
      where: { id },
      data: {
        ...(typeof nombre === 'string' ? { nombre: norm(nombre) } : {}),
        ...(typeof unidad_medida === 'string' ? { unidad_medida: norm(unidad_medida) } : {}),
        ...(typeof estado === 'boolean' ? { estado } : {}),
      },
    });
    res.json(upd);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.cambiarEstadoEmpaque = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const mp = await prisma.materias_primas.findFirst({ where: { id, tipo: 'EMPAQUE' } });
    if (!mp) return res.status(404).json({ message: 'Empaque no encontrado' });
    const next = typeof req.body?.estado === 'boolean' ? !!req.body.estado : !mp.estado;
    const upd = await prisma.materias_primas.update({ where: { id }, data: { estado: next } });
    res.json({ message: 'Estado actualizado', empaque: upd });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.eliminarEmpaque = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const mp = await prisma.materias_primas.findFirst({ where: { id, tipo: 'EMPAQUE' } });
    if (!mp) return res.status(404).json({ message: 'Empaque no encontrado' });

    // dependencias (no borrar si hay algo asociado)
    const tieneLotes = await prisma.lotes_materia_prima.findFirst({
      where: { materia_prima_id: id },
    });
    if (tieneLotes)
      return res.status(409).json({ message: 'No se puede eliminar: tiene lotes asociados' });

    const tieneMovs = await prisma.movimientos_materia_prima.findFirst({
      where: { materia_prima_id: id },
    });
    if (tieneMovs)
      return res.status(409).json({ message: 'No se puede eliminar: tiene movimientos asociados' });

    await prisma.materias_primas.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/* ===== Lotes de empaque ===== */

exports.ingresarLote = async (req, res) => {
  const mpIdParam = parseInt(req.params.id, 10);
  const bodyId = parseInt(req.body.materia_prima_id, 10);
  const mpId = Number.isInteger(mpIdParam) ? mpIdParam : bodyId;

  const { codigo, cantidad, fecha_ingreso, fecha_vencimiento, proveedor_id, estado } = req.body;

  if (!Number.isInteger(mpId) || mpId <= 0) {
    return res.status(400).json({ message: 'materia_prima_id (o :id) inválido' });
  }
  if (!norm(codigo)) return res.status(400).json({ message: 'codigo es requerido' });
  if (cantidad === undefined || cantidad === null || String(cantidad).trim() === '') {
    return res.status(400).json({ message: 'cantidad es requerida' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const mp = await tx.materias_primas.findUnique({ where: { id: mpId } });
      if (!mp || mp.tipo !== 'EMPAQUE') throw new Error('Empaque no encontrado');

      const lote = await tx.lotes_materia_prima.create({
        data: {
          materia_prima_id: mpId,
          proveedor_id: proveedor_id ?? null,
          codigo: norm(codigo),
          cantidad: String(cantidad),
          // 🔒 Fechas “solo día” ancladas a UTC (12:00)
          fecha_ingreso: parseDateOnlyUTC(fecha_ingreso),
          fecha_vencimiento: fecha_vencimiento ? parseDateOnlyUTC(fecha_vencimiento) : null,
          estado: validEstado(estado) ? estado : 'DISPONIBLE',
        },
      });

      await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'ENTRADA',
          materia_prima_id: mpId,
          lote_id: lote.id,
          cantidad: String(cantidad),
          motivo: 'INGRESO_EMPAQUE',
        },
      });

      await recalcStockMP(tx, mpId);
      return lote;
    });

    res.json(out);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ message: 'Código de lote duplicado para este empaque' });
    }
    res.status(400).json({ message: e.message });
  }
};

exports.listarLotes = async (req, res) => {
  try {
    const mpId = parseInt(req.params.id, 10);
    const lotes = await prisma.lotes_materia_prima.findMany({
      where: { materia_prima_id: mpId },
      orderBy: [{ estado: 'asc' }, { fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }],
    });
    res.json(lotes);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.listarMovimientos = async (req, res) => {
  try {
    const mpId = parseInt(req.params.id, 10);
    const movs = await prisma.movimientos_materia_prima.findMany({
      where: { materia_prima_id: mpId },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    res.json(movs);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
