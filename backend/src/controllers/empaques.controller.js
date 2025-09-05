const prisma = require('../database/prismaClient');

// estados válidos para lotes
const ESTADOS = ['DISPONIBLE','RESERVADO','AGOTADO','VENCIDO','INACTIVO'];
const validEstado = (s) => ESTADOS.includes(s);

// acepta "YYYY-MM-DD" o "MM/DD/YYYY"
const toDate = (v) => {
  if (!v) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [mm, dd, yyyy] = s.split('/');
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    }
  }
  return new Date(v);
};

const recalcStockMP = async (tx, mpId) => {
  const sum = await tx.lotes_materia_prima.aggregate({
    where: { materia_prima_id: mpId, estado: { in: ['DISPONIBLE', 'RESERVADO'] } },
    _sum: { cantidad: true }
  });
  const total = sum._sum.cantidad ?? 0; // Prisma acepta number/string para Decimal
  await tx.materias_primas.update({
    where: { id: mpId },
    data: { stock_total: total }
  });
};

exports.crearEmpaque = async (req, res) => {
  try {
    const { nombre, unidad_medida = 'ud', estado = true } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ message: 'nombre requerido' });

    const mp = await prisma.materias_primas.create({
      data: { nombre: nombre.trim(), tipo: 'EMPAQUE', unidad_medida, estado }
    });
    res.json(mp);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.listarEmpaques = async (_req, res) => {
  try {
    const list = await prisma.materias_primas.findMany({
      where: { tipo: 'EMPAQUE', estado: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(list);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// Soporta: POST /api/empaques/:id/ingresos  y  POST /api/empaques/lotes (body.materia_prima_id)
exports.ingresarLote = async (req, res) => {
  const mpIdParam = parseInt(req.params.id, 10);
  const bodyId = parseInt(req.body.materia_prima_id, 10);
  const mpId = Number.isInteger(mpIdParam) ? mpIdParam : bodyId;

  const { codigo, cantidad, fecha_ingreso, fecha_vencimiento, proveedor_id, estado } = req.body;

  if (!Number.isInteger(mpId) || mpId <= 0) {
    return res.status(400).json({ message: 'materia_prima_id (o :id) inválido' });
  }
  if (!codigo?.trim()) return res.status(400).json({ message: 'codigo es requerido' });
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
          codigo: codigo.trim(),
          cantidad: String(cantidad), // ← sin Prisma.Decimal
          fecha_ingreso: toDate(fecha_ingreso),
          fecha_vencimiento: fecha_vencimiento ? toDate(fecha_vencimiento) : null,
          estado: validEstado(estado) ? estado : 'DISPONIBLE'
        }
      });

      await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'ENTRADA',
          materia_prima_id: mpId,
          lote_id: lote.id,
          cantidad: String(cantidad), // ← sin Prisma.Decimal
          motivo: 'INGRESO_EMPAQUE'
        }
      });

      await recalcStockMP(tx, mpId);
      return lote;
    });

    res.json(out);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Código de lote duplicado para este empaque' });
    res.status(400).json({ message: e.message });
  }
};

exports.listarLotes = async (req, res) => {
  try {
    const mpId = parseInt(req.params.id, 10);
    const lotes = await prisma.lotes_materia_prima.findMany({
      where: { materia_prima_id: mpId },
      orderBy: [{ estado: 'asc' }, { fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }]
    });
    res.json(lotes);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.listarMovimientos = async (req, res) => {
  try {
    const mpId = parseInt(req.params.id, 10);
    const movs = await prisma.movimientos_materia_prima.findMany({
      where: { materia_prima_id: mpId },
      orderBy: { fecha: 'desc' },
      take: 200
    });
    res.json(movs);
  } catch (e) { res.status(500).json({ message: e.message }); }
};


