const prisma = require('../database/prismaClient');
const { Prisma } = require('../generated/prisma');


/* ========= Helpers ========= */
const toDec = (x) => {
  if (x instanceof Prisma.Decimal) return x;
  if (x === null || x === undefined) return new Prisma.Decimal('0');
  if (typeof x === 'string') return new Prisma.Decimal(x);
  return new Prisma.Decimal(Number(x).toFixed(3));
};


// Aliases y normalización de unidades
const UNIT_ALIASES = {
  gr: 'g', g: 'g', gms: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l', lt: 'l', lts: 'l',
  ud: 'ud', u: 'ud', und: 'ud', uds: 'ud', unidad: 'ud', unidades: 'ud',
};
const normUnit = (u) =>
  u ? (UNIT_ALIASES[String(u).trim().toLowerCase()] || String(u).trim().toLowerCase()) : null;


function unitGroup(u) {
  switch (u) {
    case 'g':
    case 'kg':
      return 'mass';
    case 'ml':
    case 'l':
      return 'volume';
    case 'ud':
      return 'count';
    default:
      return 'unknown';
  }
}


function ensureCompatible(from, to, ctx = '') {
  const g1 = unitGroup(from);
  const g2 = unitGroup(to);
  if (g1 === 'unknown' || g2 === 'unknown' || g1 !== g2) {
    const err = new Error(`Unidades incompatibles${ctx ? ' ' + ctx : ''}: '${from}' ↔ '${to}'`);
    err.code = 'UNIT_MISMATCH';
    throw err;
  }
}


/** Convierte Prisma.Decimal entre unidades equivalentes */
function convertDecAmount(qtyDec, from, to) {
  const f = normUnit(from);
  const t = normUnit(to);
  if (!f || !t || f === t) return qtyDec;
  ensureCompatible(f, t, '(ajuste)');


  // masa
  if (f === 'g' && t === 'kg') return qtyDec.div(1000);
  if (f === 'kg' && t === 'g') return qtyDec.times(1000);


  // volumen
  if (f === 'ml' && t === 'l') return qtyDec.div(1000);
  if (f === 'l' && t === 'ml') return qtyDec.times(1000);


  // conteo
  return qtyDec;
}


/**
 * GET /api/movimientos-mp
 * Query:
 *  - materia_prima_id?, lote_id?, lote_codigo?, tipo? (ENTRADA|SALIDA|AJUSTE)
 *  - desde?, hasta? (yyyy-mm-dd) -> filtra por "fecha" (rango local)
 *  - q? (busca en motivo, código de lote y nombre de MP)
 *  - page?, pageSize? (paginado)
 */
async function listarMovimientos(req, res) {
  try {
    const {
      materia_prima_id,
      lote_id,
      lote_codigo,    // 👈 nuevo filtro por código de lote (LIKE)
      tipo,
      desde,
      hasta,
      q,
      page = '1',
      pageSize = '50',
    } = req.query;


    const where = {};
    if (materia_prima_id) where.materia_prima_id = Number(materia_prima_id);
    if (lote_id) where.lote_id = Number(lote_id);
    if (tipo) where.tipo = String(tipo).toUpperCase();


    const hasDesde = !!(desde && String(desde).trim());
    const hasHasta = !!(hasta && String(hasta).trim());


    // rango por columna "fecha" (DateTime)
    if (hasDesde || hasHasta) {
      where.fecha = {};
      if (hasDesde) where.fecha.gte = new Date(`${desde}T00:00:00`);
      if (hasHasta) where.fecha.lte = new Date(`${hasta}T23:59:59.999`);
    }


    // Filtro por código de lote (LIKE)
    if (lote_codigo && String(lote_codigo).trim()) {
      const term = String(lote_codigo).trim();
      where.lotes = { is: { codigo: { contains: term, mode: 'insensitive' } } };
    }


    // Búsqueda libre "q": motivo, código de lote y nombre de MP
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { motivo: { contains: term, mode: 'insensitive' } },
        { lotes: { is: { codigo: { contains: term, mode: 'insensitive' } } } },
        { materias_primas: { is: { nombre: { contains: term, mode: 'insensitive' } } } },
      ];
    }


    const take = Math.max(1, Math.min(Number(pageSize) || 50, 200));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;


    const orderBy = (hasDesde || hasHasta)
      ? [{ fecha: 'desc' }, { id: 'desc' }]
      : [{ id: 'desc' }];


    const [total, items] = await Promise.all([
      prisma.movimientos_materia_prima.count({ where }),
      prisma.movimientos_materia_prima.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          materias_primas: { select: { id: true, nombre: true, unidad_medida: true } },
          // incluir código del lote
          lotes: { select: { id: true, codigo: true, fecha_ingreso: true, fecha_vencimiento: true } },
        },
      }),
    ]);


    const rows = items.map((m) => ({
      id: m.id,
      fecha: m.fecha,
      tipo: m.tipo,
      motivo: m.motivo,
      ref_tipo: m.ref_tipo,
      ref_id: m.ref_id,
      materia_prima_id: m.materia_prima_id,
      lote_id: m.lote_id,
      cantidad: m.cantidad?.toString?.() ?? String(m.cantidad),
      unidad_base: normUnit(m.materias_primas?.unidad_medida || 'g'),
      materia_prima: m.materias_primas
        ? {
            id: m.materias_primas.id,
            nombre: m.materias_primas.nombre,
            unidad_medida: normUnit(m.materias_primas.unidad_medida),
          }
        : null,
      lote: m.lotes
        ? {
            id: m.lotes.id,
            codigo: m.lotes.codigo || null,               // 👈 devolver código
            fecha_vencimiento: m.lotes.fecha_vencimiento,
          }
        : null,
    }));


    res.json({ total, page: Number(page) || 1, pageSize: take, items: rows });
  } catch (e) {
    console.error('[listarMovimientos]', e);
    res.status(500).json({ message: 'Error listando movimientos' });
  }
}


/**
 * POST /api/movimientos-mp/ajuste (ADMIN)
 * body: { materia_prima_id, lote_id?, lote_codigo?, cantidad, motivo?, unidad? }
 * - `cantidad` puede ser positiva (entra) o negativa (sale)
 * - si envías `unidad` (g|kg|ml|l|ud) se convierte a la UNIDAD BASE de la MP antes de aplicar
 * - puedes identificar el lote por `lote_id` o por `lote_codigo` (requiere materia_prima_id)
 */
async function crearAjuste(req, res) {
  const { materia_prima_id, lote_id, lote_codigo, cantidad, motivo, unidad } = req.body;


  if (!materia_prima_id || cantidad === undefined) {
    return res.status(400).json({ message: 'materia_prima_id y cantidad son obligatorios' });
  }
  if (!lote_id && !lote_codigo) {
    return res.status(400).json({ message: 'Debes enviar lote_id o lote_codigo' });
  }


  const cantNum = Number(cantidad);
  if (Number.isNaN(cantNum) || cantNum === 0) {
    return res.status(400).json({ message: 'La cantidad debe ser un número distinto de 0' });
  }


  try {
    const result = await prisma.$transaction(async (tx) => {
      // Resolver el lote por id o por (materia_prima_id + codigo)
      let lote;
      if (lote_id) {
        lote = await tx.lotes_materia_prima.findUnique({
          where: { id: Number(lote_id) },
          select: { id: true, cantidad: true, estado: true, materia_prima_id: true },
        });
      } else {
        // por código
        const mpId = Number(materia_prima_id);
        const code = String(lote_codigo).trim();
        lote = await tx.lotes_materia_prima.findFirst({
          where: { materia_prima_id: mpId, codigo: code },
          select: { id: true, cantidad: true, estado: true, materia_prima_id: true },
        });
      }


      if (!lote) throw new Error('Lote no encontrado');
      if (lote.materia_prima_id !== Number(materia_prima_id)) {
        throw new Error('El lote no pertenece a la materia prima indicada');
      }


      // Unidad base de la MP
      const mp = await tx.materias_primas.findUnique({
        where: { id: lote.materia_prima_id },
        select: { unidad_medida: true },
      });
      if (!mp) throw new Error('Materia prima no encontrada');
      const baseUnit = normUnit(mp.unidad_medida) || 'g';


      // Normalizar cantidad a unidad base si viene `unidad`
      const inputUnit = unidad ? normUnit(unidad) : baseUnit;
      ensureCompatible(inputUnit, baseUnit, '(ajuste)');
      const cantBase = convertDecAmount(toDec(cantNum), inputUnit, baseUnit);


      const nueva = toDec(lote.cantidad).plus(cantBase);
      if (nueva.lt(0)) throw new Error('El ajuste dejaría el lote con cantidad negativa');


      // 1) movimiento (AJUSTE)
      const mov = await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'AJUSTE',
          materia_prima_id: Number(materia_prima_id),
          lote_id: lote.id,
          cantidad: cantBase, // SIEMPRE en unidad base de la MP
          motivo: motivo || null,
          ref_tipo: 'MANUAL',
        },
      });


      // 2) actualizar lote y estado
      const nuevoEstado =
        nueva.eq(0) ? 'AGOTADO'
        : (lote.estado === 'AGOTADO' && nueva.gt(0) ? 'DISPONIBLE' : lote.estado);


      const loteUpd = await tx.lotes_materia_prima.update({
        where: { id: lote.id },
        data: { cantidad: nueva, estado: nuevoEstado },
      });


      // 3) re-sync stock_total (solo DISPONIBLE)
      const agg = await tx.lotes_materia_prima.aggregate({
        where: { materia_prima_id: lote.materia_prima_id, estado: 'DISPONIBLE' },
        _sum: { cantidad: true },
      });
      const total = agg._sum.cantidad ?? new Prisma.Decimal('0.000');


      const mpUpd = await tx.materias_primas.update({
        where: { id: lote.materia_prima_id },
        data: { stock_total: total },
        select: { id: true, stock_total: true },
      });


      return { mov, lote: loteUpd, mp: mpUpd, unidad_base: baseUnit };
    });


    res.json({ message: 'Ajuste registrado', ...result });
  } catch (e) {
    console.error('[crearAjuste]', e);
    res.status(400).json({ message: e.message || 'Error registrando ajuste' });
  }
}


module.exports = { listarMovimientos, crearAjuste };





