const prisma = require('../database/prismaClient');
const { Prisma } = require('@prisma/client');

const recalcStockPT = async (tx, productoId) => {
  const sum = await tx.lotes_producto_terminado.aggregate({
    where: { producto_id: productoId, estado: { in: ['DISPONIBLE', 'RESERVADO'] } },
    _sum: { cantidad: true }
  });
  await tx.productos_terminados.update({
    where: { id: productoId },
    data: { stock_total: sum._sum.cantidad || new Prisma.Decimal(0) }
  });
};

const consumirEmpaqueFIFO = async (tx, empaqueId, cantidadNecesaria) => {
  let restante = new Prisma.Decimal(cantidadNecesaria);
  const consumos = [];

  const lotes = await tx.lotes_materia_prima.findMany({
    where: { materia_prima_id: empaqueId, estado: 'DISPONIBLE' },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }]
  });

  for (const lote of lotes) {
    if (restante.lte(0)) break;
    const disponible = new Prisma.Decimal(lote.cantidad);
    const usar = Prisma.Decimal.min(disponible, restante);
    if (usar.gt(0)) {
      // descontar del lote
      await tx.lotes_materia_prima.update({
        where: { id: lote.id },
        data: { cantidad: disponible.minus(usar), estado: disponible.minus(usar).eq(0) ? 'AGOTADO' : 'DISPONIBLE' }
      });
      // registrar movimiento SALIDA
      await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'SALIDA',
          materia_prima_id: empaqueId,
          lote_id: lote.id,
          cantidad: usar,
          motivo: 'CONSUMO_POR_INGRESO_PT',
          ref_tipo: 'PT_INGRESO'
        }
      });
      consumos.push({ lote_id: lote.id, cantidad: usar });
      restante = restante.minus(usar);
    }
  }

  if (restante.gt(0)) throw new Error(`Empaques insuficientes. Faltan ${restante.toString()} ud`);
  return consumos;
};

module.exports = { recalcStockPT, consumirEmpaqueFIFO };



