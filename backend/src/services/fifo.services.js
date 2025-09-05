// src/services/fifo.services.js
const { Prisma } = require('../generated/prisma');

/* ========= Helpers de Decimal ========= */
function toDec(x) {
  if (x instanceof Prisma.Decimal) return x;
  if (x === null || x === undefined) return new Prisma.Decimal('0');
  if (typeof x === 'string') return new Prisma.Decimal(x);
  return new Prisma.Decimal(Number(x).toFixed(3));
}

/* ========= Normalización y conversión de unidades ========= */
const UNIT_ALIASES = {
  gr: 'g', g: 'g', gms: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l', lt: 'l', lts: 'l',
  ud: 'ud', u: 'ud', und: 'ud', uds: 'ud', unidad: 'ud', unidades: 'ud',
};

function normUnit(u) {
  if (!u) return null;
  const k = String(u).trim().toLowerCase();
  return UNIT_ALIASES[k] || k;
}

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

function ensureCompatible(from, to, context = '') {
  const g1 = unitGroup(from);
  const g2 = unitGroup(to);
  if (g1 === 'unknown' || g2 === 'unknown' || g1 !== g2) {
    const err = new Error(
      `Unidades incompatibles${context ? ' ' + context : ''}: '${from}' ↔ '${to}'`
    );
    err.code = 'UNIT_MISMATCH';
    throw err;
  }
}

/** Convierte una cantidad (Prisma.Decimal) entre unidades del mismo grupo. */
function convertDecAmount(qtyDec, from, to) {
  const fromU = normUnit(from);
  const toU = normUnit(to);
  if (!fromU || !toU) return qtyDec;
  if (fromU === toU) return qtyDec;

  ensureCompatible(fromU, toU, '(conversión)');

  // Masa
  if (fromU === 'g' && toU === 'kg') return qtyDec.div(1000);
  if (fromU === 'kg' && toU === 'g') return qtyDec.times(1000);

  // Volumen
  if (fromU === 'ml' && toU === 'l') return qtyDec.div(1000);
  if (fromU === 'l' && toU === 'ml') return qtyDec.times(1000);

  // Conteo
  if (fromU === 'ud' && toU === 'ud') return qtyDec;

  return qtyDec;
}

/* ========= Re-sync de stock_total ========= */
async function reSyncStockMateria(tx, materia_prima_id) {
  const mpId = Number(materia_prima_id);
  const agg = await tx.lotes_materia_prima.aggregate({
    where: { materia_prima_id: mpId, estado: 'DISPONIBLE' },
    _sum: { cantidad: true },
  });
  const total = agg._sum.cantidad ?? new Prisma.Decimal('0');
  await tx.materias_primas.update({
    where: { id: mpId },
    data: { stock_total: total },
  });
  return total;
}

/* ========= Simulación FIFO ========= */
async function simularFIFO(client, materia_prima_id, cantidadRequerida, ctx = {}) {
  const mpId = Number(materia_prima_id);

  const mp = await client.materias_primas.findUnique({
    where: { id: mpId },
    select: { unidad_medida: true },
  });
  if (!mp) {
    const err = new Error(`Materia prima ${mpId} no encontrada`);
    err.code = 'MP_NOT_FOUND';
    throw err;
  }
  const baseUnit = normUnit(mp.unidad_medida) || 'g';

  const reqInputUnit = ctx.unidad ? normUnit(ctx.unidad) : baseUnit;
  const requeridoRaw = toDec(cantidadRequerida);
  ensureCompatible(reqInputUnit, baseUnit, `(MP ${mpId})`);
  const requerido = convertDecAmount(requeridoRaw, reqInputUnit, baseUnit);

  const lotes = await client.lotes_materia_prima.findMany({
    where: {
      materia_prima_id: mpId,
      estado: { in: ['DISPONIBLE', 'RESERVADO'] },
      cantidad: { gt: 0 },
    },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }],
  });

  let restante = requerido;
  const plan = [];

  for (const lote of lotes) {
    if (restante.lte(0)) break;
    const disponible = toDec(lote.cantidad);
    if (disponible.lte(0)) continue;

    const usar = disponible.lt(restante) ? disponible : restante;
    if (usar.lte(0)) continue;

    plan.push({
      lote_id: lote.id,
      usar: usar.toString(),
      disponible: disponible.toString(),
      fecha_ingreso: lote.fecha_ingreso,
      fecha_vencimiento: lote.fecha_vencimiento,
    });

    restante = restante.minus(usar);
  }

  return {
    suficiente: restante.lte(0),
    faltante: restante.gt(0) ? restante.toString() : '0',
    plan,
    unidad: baseUnit,
  };
}

/* ========= Descuento FIFO con escritura ========= */
/**
 * @param {Prisma.TransactionClient} tx
 * @param {number} materia_prima_id
 * @param {number|string|Prisma.Decimal} cantidadRequerida
 * @param {{
 *   motivo?: string,
 *   produccionId?: number,
 *   unidad?: string,
 *   observacion?: string,
 *   fecha?: Date,
 *   ref_tipo?: string,
 *   ref_id?: number|null
 * }} ctx
 */
async function descontarFIFO(tx, materia_prima_id, cantidadRequerida, ctx = {}) {
  const mpId = Number(materia_prima_id);

  const mp = await tx.materias_primas.findUnique({
    where: { id: mpId },
    select: { unidad_medida: true },
  });
  if (!mp) {
    const err = new Error(`Materia prima ${mpId} no encontrada`);
    err.code = 'MP_NOT_FOUND';
    throw err;
  }
  const baseUnit = normUnit(mp.unidad_medida) || 'g';

  const reqInputUnit = ctx.unidad ? normUnit(ctx.unidad) : baseUnit;
  const requeridoRaw = toDec(cantidadRequerida);
  ensureCompatible(reqInputUnit, baseUnit, `(MP ${mpId})`);
  const requerido = convertDecAmount(requeridoRaw, reqInputUnit, baseUnit);

  if (requerido.lte(0)) {
    throw new Error('La cantidad requerida debe ser mayor a 0');
  }

  const aggTotal = await tx.lotes_materia_prima.aggregate({
    where: {
      materia_prima_id: mpId,
      estado: { in: ['DISPONIBLE', 'RESERVADO'] },
      cantidad: { gt: 0 },
    },
    _sum: { cantidad: true },
  });
  const totalDisponible = toDec(aggTotal._sum.cantidad || 0);
  if (totalDisponible.lt(requerido)) {
    const err = new Error(
      `Stock insuficiente de materia prima (id ${mpId}). Falta ${requerido.minus(totalDisponible).toString()} ${baseUnit}.`
    );
    err.code = 'STOCK_INSUFICIENTE';
    throw err;
  }

  const lotes = await tx.lotes_materia_prima.findMany({
    where: {
      materia_prima_id: mpId,
      estado: { in: ['DISPONIBLE', 'RESERVADO'] },
      cantidad: { gt: 0 },
    },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }],
  });

  let restante = requerido;

  for (const lote of lotes) {
    if (restante.lte(0)) break;

    const disponible = toDec(lote.cantidad);
    if (disponible.lte(0)) continue;

    const usar = disponible.lt(restante) ? disponible : restante;
    if (usar.lte(0)) continue;

    // Motivo con observación (si viene)
    const motivoBase = ctx.motivo || 'Consumo FIFO';
    const obs = ctx.observacion && String(ctx.observacion).trim();
    const motivoFinal = obs ? `${motivoBase} — Obs: ${obs}` : motivoBase;

    // Referencias de movimiento: prioriza ctx.ref_tipo/ref_id; de lo contrario usa produccionId
    const refTipo = (ctx.ref_tipo && String(ctx.ref_tipo)) || (ctx.produccionId ? 'PRODUCCION' : 'CONSUMO');
    const refId = (ctx.ref_id !== undefined ? ctx.ref_id : (ctx.produccionId || null));

    // Movimiento SALIDA (guardar fecha si viene)
    await tx.movimientos_materia_prima.create({
      data: {
        tipo: 'SALIDA',
        materia_prima_id: mpId,
        lote_id: lote.id,
        cantidad: usar, // en baseUnit (si es SALIDA, guardamos positivo; UI lo muestra negativo)
        motivo: motivoFinal,
        ref_tipo: refTipo,
        ref_id: refId,
        fecha: ctx.fecha || undefined,
      },
    });

    // Actualizar lote
    const nuevaCantidad = disponible.minus(usar);
    const nuevoEstado = nuevaCantidad.eq(0) ? 'AGOTADO' : lote.estado;

    await tx.lotes_materia_prima.update({
      where: { id: lote.id },
      data: { cantidad: nuevaCantidad, estado: nuevoEstado },
    });

    // Trazabilidad solo si hay producción
    if (ctx.produccionId) {
      await tx.trazabilidad_produccion.create({
        data: {
          produccion_id: ctx.produccionId,
          lote_id: lote.id,
          materia_prima_id: mpId,
          cantidad_usada: usar,
        },
      });
    }

    restante = restante.minus(usar);
  }

  if (restante.gt(0)) {
    const err = new Error(
      `Stock insuficiente de materia prima (id ${mpId}). Falta ${restante.toString()} ${baseUnit}.`
    );
    err.code = 'STOCK_INSUFICIENTE';
    throw err;
  }

  await reSyncStockMateria(tx, mpId);
}

module.exports = {
  descontarFIFO,
  reSyncStockMateria,
  simularFIFO,
};



