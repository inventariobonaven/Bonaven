// src/controllers/produccion.controller.js
const prisma = require('../database/prismaClient');
const { Prisma } = require('../generated/prisma');
const { descontarFIFO, simularFIFO } = require('../services/fifo.services');

// más tiempo para operaciones largas (recorrer muchos lotes)
const TX_OPTS = { timeout: 45000, maxWait: 10000 };

/* ===== Helpers ===== */
function buildDateWithTime(fechaStr, hhmm) {
  const base = fechaStr ? new Date(fechaStr) : new Date();
  const [h = '0', m = '0'] = String(hhmm || '').split(':');
  base.setHours(Number(h), Number(m), 0, 0);
  return base;
}
function parseDateOrTime(fechaStr, isoOrTime) {
  if (!isoOrTime) return null;
  const val = String(isoOrTime);
  if (val.includes('T') || val.length > 5) {
    const d = new Date(val);
    return isNaN(d) ? null : d;
  }
  return buildDateWithTime(fechaStr, val);
}
const toDec = (x) => {
  if (x instanceof Prisma.Decimal) return x;
  if (x === null || x === undefined) return new Prisma.Decimal('0');
  if (typeof x === 'string') return new Prisma.Decimal(x);
  return new Prisma.Decimal(Number(x).toFixed(3));
};
function yyyymmdd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

/* Etapas vendibles (suman a stock_total) */
const VENTAS_ETAPAS = ['EMPAQUE', 'HORNEO'];

// Recalcula stock_total de PT SOLO con etapas vendibles (EMPAQUE y HORNEO)
async function recalcStockPTReady(tx, productoId) {
  const agg = await tx.lotes_producto_terminado.aggregate({
    where: {
      producto_id: Number(productoId),
      estado: { in: ['DISPONIBLE', 'RESERVADO'] },
      etapa: { in: VENTAS_ETAPAS },
    },
    _sum: { cantidad: true },
  });
  await tx.productos_terminados.update({
    where: { id: Number(productoId) },
    data: { stock_total: agg._sum.cantidad ?? 0 },
  });
}

/* Bolsas a descontar:
  - Con unidades_por_empaque (>0): bolsas_por_unidad = bolsas por paquete (default 1).
  - Sin unidades_por_empaque: modo legado -> bolsas_por_unidad = bolsas por unidad. */
function calcularBolsasNecesarias(cantidadUnidades, bolsas_por_unidad, unidades_por_empaque) {
  const qty = Math.max(0, Number(cantidadUnidades) || 0);
  const packSize = Number(unidades_por_empaque ?? 0);   // unidades por paquete
  const bppRaw   = Number(bolsas_por_unidad ?? 0);

  if (packSize > 0) {
    // Bolsas por paquete (si no viene, asumimos 1)
    const bolsasPorPaquete = bppRaw > 0 ? bppRaw : 1;
    return Math.ceil((qty / packSize) * bolsasPorPaquete);
  }

  // Modo legado: bolsas_por_unidad = bolsas por unidad
  if (bppRaw > 0) return Math.ceil(qty * bppRaw);

  return 0;
}

async function registrarProduccion(req, res) {
  const { receta_id, cantidad_producida, fecha, hora_inicio, hora_fin, observacion, lote_codigo } = req.body;

  if (!receta_id || !cantidad_producida) {
    return res.status(400).json({ message: 'receta_id y cantidad_producida son obligatorios' });
  }
  const qty = Number(cantidad_producida);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'cantidad_producida debe ser > 0' });
  }

  // Validación de horas: o vienen ambas, o ninguna
  if ((hora_inicio && !hora_fin) || (!hora_inicio && hora_fin)) {
    return res.status(400).json({ message: 'Debe enviar ambas horas: hora_inicio y hora_fin' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const receta = await tx.recetas.findUnique({
        where: { id: Number(receta_id) },
        include: {
          ingredientes_receta: true,
          productos_terminados: true, // informativo
          producto_maps: true,        // mapeos Receta ↔ Producto (rendimiento/vencimiento)
        },
      });
      if (!receta || !receta.estado) throw new Error('Receta no encontrada o inactiva');

      if (!Array.isArray(receta.producto_maps) || receta.producto_maps.length === 0) {
        return res.status(400).json({
          message: 'La receta no tiene productos mapeados. Configure Receta ↔ Producto antes de producir.',
        });
      }

      // === obtener "tipo" de cada MP para detectar CULTIVO (masa madre) ===
      const mpIds = receta.ingredientes_receta
        .map(i => Number(i.materia_prima_id))
        .filter(Boolean);
      const mpMeta = mpIds.length
        ? await tx.materias_primas.findMany({
            where: { id: { in: mpIds } },
            select: { id: true, tipo: true }
          })
        : [];
      const mpTipo = new Map(mpMeta.map(m => [m.id, String(m.tipo || '').toUpperCase()]));

      // 0) Preparar horas y duración (si vienen)
      let dtInicio = null;
      let dtFin = null;
      let duracionMin = null;
      const fechaProd = fecha ? new Date(fecha) : new Date();

      if (hora_inicio && hora_fin) {
        dtInicio = parseDateOrTime(fecha, hora_inicio);
        dtFin = parseDateOrTime(fecha, hora_fin);

        if (!dtInicio || !dtFin || isNaN(dtInicio) || isNaN(dtFin)) {
          throw new Error('Formato de hora inválido. Envíe HH:mm o datetime ISO.');
        }
        // Si vinieron como HH:mm (misma fecha) y el fin es menor, asumir cruce de medianoche
        if (fecha && String(hora_inicio).length <= 5 && String(hora_fin).length <= 5) {
          if (dtFin.getTime() < dtInicio.getTime()) dtFin.setDate(dtFin.getDate() + 1);
        }

        const diffMs = dtFin.getTime() - dtInicio.getTime();
        if (diffMs <= 0) throw new Error('La hora fin debe ser posterior a la hora inicio');
        duracionMin = Math.round(diffMs / 60000);
      }

      // 1) Crear cabecera
      const produccion = await tx.producciones.create({
        data: {
          receta_id: receta.id,
          cantidad_producida: qty,
          fecha: fecha ? new Date(fecha) : undefined,
          hora_inicio: dtInicio || undefined,
          hora_fin: dtFin || undefined,
          duracion_minutos: duracionMin ?? undefined,
          observacion: (observacion && String(observacion).trim()) || null,
        },
      });

      // 2) Descontar por FIFO los ingredientes (OMITIENDO CULTIVO)
      const mpUsadas = new Set();
      for (const ing of receta.ingredientes_receta) {
        const mpId = Number(ing.materia_prima_id);
        const porUnidad = Number(ing.cantidad); // ya en unidad base de la MP
        const requerido = porUnidad * qty;

        const tipo = mpTipo.get(mpId); // <- "CULTIVO" para masa madre
        if (tipo === 'CULTIVO') {
          // No descontamos stock para CULTIVO (masa madre)
          continue;
        }

        await descontarFIFO(tx, mpId, requerido, {
          motivo: `Consumo producción #${produccion.id} (${receta.nombre})`,
          produccionId: produccion.id,
          ref_tipo: 'PRODUCCION',
          ref_id: produccion.id,
          observacion: (observacion && String(observacion).trim()) || '',
          fecha: fecha ? new Date(fecha) : undefined,
        });

        mpUsadas.add(mpId);
      }

      // 3) Sync stock_total de MP usadas
      for (const mpId of mpUsadas) {
        const agg = await tx.lotes_materia_prima.aggregate({
          where: { materia_prima_id: mpId, estado: 'DISPONIBLE' },
          _sum: { cantidad: true },
        });
        await tx.materias_primas.update({
          where: { id: mpId },
          data: { stock_total: agg._sum.cantidad ?? 0 },
        });
      }

      // 4) Ingreso de PT por mapeos
      const codigoBase = (lote_codigo && String(lote_codigo).trim()) || yyyymmdd(fechaProd);
      const resumenPT = [];
      const afectados = new Set(); // productos a recalcular stock_total listo-venta

      const productoIds = receta.producto_maps.map((m) => m.producto_id);
      const productos = await tx.productos_terminados.findMany({
        where: { id: { in: productoIds } },
        select: {
          id: true,
          nombre: true,
          requiere_congelacion_previa: true,
          empaque_mp_id: true,
          bolsas_por_unidad: true,
          unidades_por_empaque: true,
        },
      });
      const prodMap = new Map(productos.map((p) => [p.id, p]));

      for (const m of receta.producto_maps) {
        const producto = prodMap.get(m.producto_id);
        if (!producto) continue;

        // Unidades enteras
        const unidades = Number(m.unidades_por_batch) * qty;
        if (!(unidades > 0)) continue;

        const etapaInicial = producto.requiere_congelacion_previa ? 'CONGELADO' : 'EMPAQUE';

        // Vencimiento: SIEMPRE desde la producción (regla global)
        const fechaVto = addDays(fechaProd, Number(m.vida_util_dias || 0));

        // Buscar/crear/actualizar lote
        let lote = await tx.lotes_producto_terminado.findFirst({
          where: { producto_id: producto.id, codigo: codigoBase },
        });

        if (!lote) {
          lote = await tx.lotes_producto_terminado.create({
            data: {
              producto_id: producto.id,
              codigo: codigoBase,
              cantidad: unidades,
              fecha_ingreso: fechaProd,
              fecha_vencimiento: fechaVto,
              estado: 'DISPONIBLE',
              etapa: etapaInicial,
            },
          });
        } else {
          const newData = { cantidad: toDec(lote.cantidad).plus(unidades).toString() };
          if (!lote.fecha_vencimiento && fechaVto) newData.fecha_vencimiento = fechaVto;
          await tx.lotes_producto_terminado.update({
            where: { id: lote.id },
            data: newData,
          });
        }

        // Movimiento ENTRADA PT
        await tx.stock_producto_terminado.create({
          data: {
            producto_id: producto.id,
            lote_id: lote.id,
            tipo: 'ENTRADA',
            cantidad: unidades,
            fecha: fechaProd,
            motivo: `Ingreso por producción #${produccion.id} (${receta.nombre})`,
            ref_tipo: 'PRODUCCION_PT',
            ref_id: produccion.id,
          },
        });

        // Descontar bolsas si etapaInicial = EMPAQUE
        if (etapaInicial === 'EMPAQUE') {
          const empaqueId = Number(producto.empaque_mp_id || 0);
          if (empaqueId > 0) {
            const bolsasNecesarias = calcularBolsasNecesarias(
              unidades,
              producto.bolsas_por_unidad,
              producto.unidades_por_empaque
            );
            if (bolsasNecesarias > 0) {
              await descontarFIFO(tx, empaqueId, bolsasNecesarias, {
                motivo: `Empaque producción #${produccion.id} (${receta.nombre})`,
                ref_tipo: 'PRODUCCION_PT',
                ref_id: produccion.id,
                fecha: fechaProd,
              });

              // Sync stock_total MP (empaque)
              const aggMp = await tx.lotes_materia_prima.aggregate({
                where: { materia_prima_id: empaqueId, estado: 'DISPONIBLE' },
                _sum: { cantidad: true },
              });
              await tx.materias_primas.update({
                where: { id: empaqueId },
                data: { stock_total: aggMp._sum.cantidad ?? 0 },
              });
            }
          }
        }

        if (etapaInicial === 'EMPAQUE') afectados.add(producto.id);

        resumenPT.push({
          producto_id: producto.id,
          producto: producto.nombre,
          lote_codigo: codigoBase,
          etapa: etapaInicial,
          cantidad: unidades,
          fecha_vencimiento: fechaVto || null,
        });
      }

      // 5) Recalcular stock_total vendible (EMPAQUE + HORNEO)
      for (const pid of afectados) {
        await recalcStockPTReady(tx, pid);
      }

      return { produccion, resumenPT };
    }, TX_OPTS);

    res.json({
      message: 'Producción registrada',
      produccion: result.produccion,
      ingresos_pt: result.resumenPT,
    });
  } catch (e) {
    console.error('[registrarProduccion]', e);
    const msg = e?.message || 'Error registrando producción';
    const status = e.code === 'STOCK_INSUFICIENTE' ? 400 : 400;
    res.status(status).json({ message: msg });
  }
}

async function calcularProduccion(req, res) {
  try {
    const { receta_id, cantidad } = req.body;
    if (!receta_id || !cantidad) {
      return res.status(400).json({ message: 'receta_id y cantidad son obligatorios' });
    }
    const qty = Number(cantidad);
    if (Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'cantidad debe ser > 0' });
    }

    const receta = await prisma.recetas.findUnique({
      where: { id: Number(receta_id) },
      include: {
        ingredientes_receta: true,
        productos_terminados: true,
        producto_maps: {
          include: {
            producto: {
              select: {
                id: true,
                nombre: true,
                requiere_congelacion_previa: true,
                empaque_mp_id: true,
                bolsas_por_unidad: true,
                unidades_por_empaque: true,
              },
            },
          },
        },
      },
    });
    if (!receta || !receta.estado) {
      return res.status(404).json({ message: 'Receta no encontrada o inactiva' });
    }

    // meta de MPs para saber cuáles son CULTIVO
    const mpIds = receta.ingredientes_receta
      .map(i => Number(i.materia_prima_id))
      .filter(Boolean);
    const mpMeta = mpIds.length
      ? await prisma.materias_primas.findMany({
          where: { id: { in: mpIds } },
          select: { id: true, tipo: true, nombre: true, unidad_medida: true },
        })
      : [];
    const mpTipo   = new Map(mpMeta.map(m => [m.id, String(m.tipo || '').toUpperCase()]));
    const mpUnidad = new Map(mpMeta.map(m => [m.id, m.unidad_medida || 'ud']));

    const detalles = [];
    const faltantes = [];

    for (const ing of receta.ingredientes_receta) {
      const mpId = Number(ing.materia_prima_id);
      const porUnidad = Number(ing.cantidad);
      const requerido = porUnidad * qty;

      const tipo = mpTipo.get(mpId);
      if (tipo === 'CULTIVO') {
        detalles.push({
          materia_prima_id: mpId,
          requerido: requerido.toString(),
          unidad: mpUnidad.get(mpId) || 'ud',
          suficiente: true,
          faltante: '0',
          lotes: [],
        });
        continue;
      }

      const sim = await simularFIFO(prisma, mpId, requerido);

      // Enriquecer con datos de lote
      const plan = Array.isArray(sim.plan) ? sim.plan : [];
      const ids = [...new Set(plan.map((p) => p.lote_id).filter(Boolean))];
      let lotMap = new Map();
      if (ids.length) {
        const lotes = await prisma.lotes_materia_prima.findMany({
          where: { id: { in: ids } },
          select: { id: true, codigo: true, fecha_vencimiento: true },
        });
        lotes.forEach((l) => lotMap.set(l.id, l));
      }
      const enrichedPlan = plan.map((p) => {
        const ref = lotMap.get(p.lote_id);
        return {
          lote_id: p.lote_id,
          lote_codigo: ref?.codigo || null,
          fecha_vencimiento: p.fecha_vencimiento ?? ref?.fecha_vencimiento ?? null,
          usar: p.usar,
          disponible: p.disponible,
        };
      });

      detalles.push({
        materia_prima_id: mpId,
        requerido: requerido.toString(),
        unidad: sim.unidad,
        suficiente: sim.suficiente,
        faltante: sim.faltante,
        lotes: enrichedPlan,
      });

      if (!sim.suficiente) faltantes.push(mpId);
    }

    // Plan esperado de PT (vencimiento SIEMPRE desde producción)
    const fechaRef = new Date();
    const codigoLoteDia = yyyymmdd(fechaRef);
    const pt_plan = (receta.producto_maps || []).map((m) => {
      const unidades = Number(m.unidades_por_batch) * qty;
      const etapa = m.producto?.requiere_congelacion_previa ? 'CONGELADO' : 'EMPAQUE';
      const vto = addDays(fechaRef, Number(m.vida_util_dias || 0));

      return {
        producto_id: m.producto_id,
        producto: m.producto?.nombre || `Producto #${m.producto_id}`,
        cantidad: unidades,
        etapa_inicial: etapa,
        lote_codigo: codigoLoteDia,
        fecha_vencimiento: vto,
      };
    });

    res.json({
      ok: faltantes.length === 0,
      faltantes,
      detalles,
      pt_plan,
      receta: { id: receta.id, nombre: receta.nombre },
    });
  } catch (e) {
    console.error('[calcularProduccion]', e);
    res.status(500).json({ message: e?.message || 'Error calculando producción' });
  }
}

/* =========================================================
Listado (paginado) y Detalle
========================================================= */

/** GET /api/produccion */
async function listarProducciones(req, res) {
  try {
    const { desde, hasta, receta_id, q, page = '1', pageSize = '50' } = req.query;

    const where = {};
    if (receta_id) where.receta_id = Number(receta_id);

    // rango por fecha (DATE)
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        where.fecha.lte = h;
      }
    }

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { observacion: { contains: term, mode: 'insensitive' } },
        { recetas: { is: { nombre: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const take = Math.max(1, Math.min(Number(pageSize) || 50, 200));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [total, items] = await Promise.all([
      prisma.producciones.count({ where }),
      prisma.producciones.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: {
          recetas: {
            select: {
              id: true,
              nombre: true,
              rendimiento_por_batch: true,
              productos_terminados: { select: { id: true, nombre: true } },
              categoria: { select: { id: true, nombre: true } },
            },
          },
        },
      }),
    ]);

    res.json({ total, page: Number(page) || 1, pageSize: take, items });
  } catch (e) {
    console.error('[listarProducciones]', e);
    res.status(500).json({ message: 'Error listando producciones' });
  }
}

/** GET /api/produccion/:id */
async function detalleProduccion(req, res) {
  try {
    const id = Number(req.params.id);
    const p = await prisma.producciones.findUnique({
      where: { id },
      include: {
        recetas: {
          select: {
            id: true,
            nombre: true,
            rendimiento_por_batch: true,
            productos_terminados: { select: { id: true, nombre: true } },
            categoria: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (!p) return res.status(404).json({ message: 'Producción no encontrada' });
    res.json(p);
  } catch (e) {
    console.error('[detalleProduccion]', e);
    res.status(500).json({ message: 'Error obteniendo producción' });
  }
}

/**
* GET /api/produccion/:id/insumos
* Devuelve las materias primas consumidas (sumadas) y detalle por lote.
*/
async function insumosProduccion(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const prod = await prisma.producciones.findUnique({ where: { id }, select: { id: true } });
    if (!prod) return res.status(404).json({ message: 'Producción no encontrada' });

    const movs = await prisma.movimientos_materia_prima.findMany({
      where: { ref_tipo: 'PRODUCCION', ref_id: id, tipo: 'SALIDA' },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        materias_primas: { select: { id: true, nombre: true, unidad_medida: true } },
        lotes: { select: { id: true, codigo: true, fecha_vencimiento: true } },
      },
    });

    const map = new Map(); // mpId -> { mp, total, detalle[] }
    for (const m of movs) {
      const mpId = m.materia_prima_id;
      const key = String(mpId);
      const curr = map.get(key) || {
        materia_prima_id: mpId,
        nombre: m.materias_primas?.nombre || `MP #${mpId}`,
        unidad_base: (m.materias_primas?.unidad_medida || 'g').toLowerCase(),
        total: toDec(0),
        detalle: [],
      };
      const cant = toDec(m.cantidad || 0);
      curr.total = curr.total.plus(cant);
      curr.detalle.push({
        lote_id: m.lote_id,
        lote_codigo: m.lotes?.codigo || null,
        fecha_vencimiento: m.lotes?.fecha_vencimiento || null,
        cantidad: cant.toString(), // en unidad base
      });
      map.set(key, curr);
    }

    const items = Array.from(map.values()).map((x) => ({
      materia_prima_id: x.materia_prima_id,
      nombre: x.nombre,
      unidad_base: x.unidad_base,
      total: x.total.toString(),
      detalle: x.detalle,
    }));

    res.json({ items });
  } catch (e) {
    console.error('[insumosProduccion]', e);
    res.status(500).json({ message: 'Error obteniendo insumos de producción' });
  }
}

module.exports = {
  registrarProduccion,
  calcularProduccion,
  listarProducciones,
  detalleProduccion,
  insumosProduccion,
};


