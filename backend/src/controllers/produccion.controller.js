// src/controllers/produccion.controller.js
const prisma = require('../database/prismaClient');
const { Prisma } = require('../generated/prisma');
const { descontarFIFO, simularFIFO } = require('../services/fifo.services');

// más tiempo para operaciones largas (recorrer muchos lotes)
const TX_OPTS = { timeout: 45000, maxWait: 10000 };

/* ===== Helpers ===== */

/** Ancla una fecha "solo día" a las 12:00 UTC para evitar desfases por zona horaria. */
function parseDateOnlyUTC(v) {
  if (!v) return null;

  if (v instanceof Date && !isNaN(v)) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12, 0, 0, 0));
  }

  const s = String(v).trim();

  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  }

  // "MM/DD/YYYY" (defensivo)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [mm, dd, yyyy] = s.split('/').map(Number);
    return new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0, 0));
  }

  // ISO u otros
  const d = new Date(s);
  if (!isNaN(d)) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
  }
  return null;
}

/** Construye un Date local con la hora HH:mm sobre una fecha anclada a mediodía UTC. */
function buildDateWithTime(fechaStr, hhmm) {
  const base = fechaStr ? parseDateOnlyUTC(fechaStr) : parseDateOnlyUTC(new Date());
  const [h = '0', m = '0'] = String(hhmm || '').split(':');
  // setHours usa la zona local; como la base está anclada a 12:00Z, no cambia el "día lógico".
  base.setHours(Number(h), Number(m), 0, 0);
  return base;
}

/** Parsea "HH:mm" relativo a una fecha; si viene ISO completo, lo respeta. */
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
  // usamos hora local; al estar anclado a 12:00Z, coincidirá con el día lógico en usos normales
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

/** Límites de día en UTC para filtros inclusivos */
function startOfUTCDate(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function endOfUTCDate(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
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
  const packSize = Number(unidades_por_empaque ?? 0); // unidades por paquete
  const bppRaw = Number(bolsas_por_unidad ?? 0);

  if (packSize > 0) {
    // Bolsas por paquete (si no viene, asumimos 1)
    const bolsasPorPaquete = bppRaw > 0 ? bppRaw : 1;
    return Math.ceil((qty / packSize) * bolsasPorPaquete);
  }

  // Modo legado: bolsas_por_unidad = bolsas por unidad
  if (bppRaw > 0) return Math.ceil(qty * bppRaw);

  return 0;
}

// ✅ helper: decimal/strings a number limpio para el "Costo"
function toNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

async function registrarProduccion(req, res) {
  const { receta_id, cantidad_producida, fecha, hora_inicio, hora_fin, observacion, lote_codigo } =
    req.body;

  if (!receta_id || !cantidad_producida) {
    return res.status(400).json({ message: 'receta_id y cantidad_producida son obligatorios' });
  }
  const qty = Number(cantidad_producida);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'cantidad_producida debe ser > 0' });
  }

  // 🔴 Ahora SON OBLIGATORIAS
  if (!hora_inicio || !hora_fin) {
    return res
      .status(400)
      .json({ message: 'hora_inicio y hora_fin son obligatorias (HH:mm o ISO)' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const receta = await tx.recetas.findUnique({
        where: { id: Number(receta_id) },
        include: {
          ingredientes_receta: true,
          productos_terminados: true, // informativo
          producto_maps: true, // mapeos Receta ↔️ Producto (rendimiento/vencimiento)
        },
      });
      if (!receta || !receta.estado) throw new Error('Receta no encontrada o inactiva');

      if (!Array.isArray(receta.producto_maps) || receta.producto_maps.length === 0) {
        throw new Error(
          'La receta no tiene productos mapeados. Configure Receta ↔️ Producto antes de producir.',
        );
      }

      // 0) Preparar fecha, horas y duración (OBLIGATORIAS)
      const fechaProd = parseDateOnlyUTC(fecha) || parseDateOnlyUTC(new Date());

      let dtInicio = parseDateOrTime(fecha, hora_inicio);
      let dtFin = parseDateOrTime(fecha, hora_fin);

      if (!dtInicio || !dtFin || isNaN(dtInicio) || isNaN(dtFin)) {
        throw new Error('Formato de hora inválido. Envíe HH:mm o datetime ISO.');
      }

      // Si vinieron como HH:mm (misma fecha) y fin <= inicio, asumimos cruce de medianoche
      const ambosHHMM = String(hora_inicio).length <= 5 && String(hora_fin).length <= 5;
      if (ambosHHMM && dtFin.getTime() <= dtInicio.getTime()) {
        dtFin.setDate(dtFin.getDate() + 1);
      }

      const diffMs = dtFin.getTime() - dtInicio.getTime();
      if (diffMs <= 0) {
        throw new Error('La hora fin debe ser posterior a la hora inicio');
      }
      const duracionMin = Math.round(diffMs / 60000);

      // 1) Crear cabecera
      const produccion = await tx.producciones.create({
        data: {
          receta_id: receta.id,
          cantidad_producida: qty,
          fecha: fecha ? parseDateOnlyUTC(fecha) : fechaProd,
          hora_inicio: dtInicio,
          hora_fin: dtFin,
          duracion_minutos: duracionMin,
          observacion: (observacion && String(observacion).trim()) || null,
        },
      });

      // 🔔 Notificación persistente si hay observación
      if (observacion && String(observacion).trim()) {
        await tx.notificaciones.create({
          data: {
            tipo: 'OBS_PRODUCCION',
            mensaje: `Producción #${produccion.id} con observación`,
            target_rol: 'ADMIN',
            payload: {
              produccionId: produccion.id,
              recetaId: receta.id,
              receta: receta.nombre,
              cantidad: qty,
              fecha: fecha ? parseDateOnlyUTC(fecha) : fechaProd,
              observacion: String(observacion).trim(),
            },
          },
        });
      }

      // === obtener "tipo" de cada MP para detectar CULTIVO (masa madre) ===
      const mpIds = receta.ingredientes_receta
        .map((i) => Number(i.materia_prima_id))
        .filter(Boolean);
      const mpMeta = mpIds.length
        ? await tx.materias_primas.findMany({
            where: { id: { in: mpIds } },
            select: { id: true, tipo: true },
          })
        : [];
      const mpTipo = new Map(mpMeta.map((m) => [m.id, String(m.tipo || '').toUpperCase()]));

      // 2) Descontar por FIFO los ingredientes (OMITIENDO CULTIVO)
      const mpUsadas = new Set();
      for (const ing of receta.ingredientes_receta) {
        const mpId = Number(ing.materia_prima_id);
        const porUnidad = Number(ing.cantidad);
        const requerido = porUnidad * qty;

        const tipo = mpTipo.get(mpId);
        if (tipo === 'CULTIVO') continue;

        await descontarFIFO(tx, mpId, requerido, {
          motivo: `Consumo producción #${produccion.id} (${receta.nombre})`,
          produccionId: produccion.id,
          ref_tipo: 'PRODUCCION',
          ref_id: produccion.id,
          observacion: (observacion && String(observacion).trim()) || '',
          fecha: fecha ? parseDateOnlyUTC(fecha) : fechaProd,
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
      const afectados = new Set();

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
          micomercio_id: true, // ✅ OUTBOX MICOMERCIO

          // ✅ nuevo
          precio_venta_unitario: true,
        },
      });
      const prodMap = new Map(productos.map((p) => [p.id, p]));

      // ✅ OUTBOX MICOMERCIO: etapas vendibles (solo estas generan envío)
      const ETAPAS_ENVIABLES = new Set(['EMPAQUE', 'HORNEO']);

      const idUserMiComercio = Number(process.env.MICOMERCIO_IDUSER);
      if (!idUserMiComercio) {
        throw new Error('Falta configurar MICOMERCIO_IDUSER en el servidor (Render)');
      }

      for (const m of receta.producto_maps) {
        const producto = prodMap.get(m.producto_id);
        if (!producto) continue;

        const unidades = Number(m.unidades_por_batch) * qty;
        if (!(unidades > 0)) continue;

        const etapaInicial = producto.requiere_congelacion_previa ? 'CONGELADO' : 'EMPAQUE';

        const fechaVto = addDays(fechaProd, Number(m.vida_util_dias || 0));

        // Buscar/crear/actualizar lote
        let lote = await tx.lotes_producto_terminado.findFirst({
          where: { producto_id: producto.id, codigo: codigoBase },
        });

        let loteCreadoNuevo = false;

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
          loteCreadoNuevo = true;
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

        // ✅ OUTBOX MICOMERCIO (solo si etapa vendible)
        if (ETAPAS_ENVIABLES.has(String(etapaInicial)) && producto.micomercio_id) {
          // ✅ nuevo: costo (precio venta unitario) opcional
          const costo = toNumberOrNull(producto.precio_venta_unitario);

          const detail = {
            Cantidad: Number(unidades),
            IdProducto: String(producto.micomercio_id),
            Comentarios: `Ingreso por producción #${produccion.id} (${receta.nombre})`,
            ...(costo !== null ? { Costo: costo } : {}), // ✅ manda Costo solo si existe
          };

          await tx.integracion_outbox.create({
            data: {
              proveedor: 'MICOMERCIO',
              tipo: 'INGRESO_PT',
              ref_id: lote.id, // ✅ el LOTE PT, para que tu UI lo cruce por lote_id
              payload: {
                IdUser: idUserMiComercio,
                IdProduccion: produccion.id,
                cierre: 1, // ✅ según el ejemplo actualizado (si no aplica, lo quitamos)
                details: [detail],
              },
              estado: 'PENDIENTE',
              intentos: 0,
              last_error: null,
              last_status: null,
              last_resp: null,
            },
          });
        } else if (ETAPAS_ENVIABLES.has(String(etapaInicial)) && !producto.micomercio_id) {
          // opcional: dejar log en outbox para que la UI muestre ERROR y "por qué"
          await tx.integracion_outbox.create({
            data: {
              proveedor: 'MICOMERCIO',
              tipo: 'INGRESO_PT',
              ref_id: lote.id,
              payload: {
                reason: 'producto_sin_micomercio_id',
                producto_id: producto.id,
              },
              estado: 'ERROR',
              intentos: 0,
              last_error: `Producto ${producto.id} no tiene micomercio_id`,
              last_status: null,
              last_resp: null,
            },
          });
        }

        // Descontar bolsas si etapaInicial = EMPAQUE
        if (etapaInicial === 'EMPAQUE') {
          const empaqueId = Number(producto.empaque_mp_id || 0);
          if (empaqueId > 0) {
            const bolsasNecesarias = calcularBolsasNecesarias(
              unidades,
              producto.bolsas_por_unidad,
              producto.unidades_por_empaque,
            );
            if (bolsasNecesarias > 0) {
              await descontarFIFO(tx, empaqueId, bolsasNecesarias, {
                motivo: `Empaque producción #${produccion.id} (${receta.nombre})`,
                ref_tipo: 'PRODUCCION_PT',
                ref_id: produccion.id,
                fecha: fechaProd,
              });

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
          lote_id: lote.id,
          lote_creado_nuevo: loteCreadoNuevo,
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
    res.status(400).json({ message: msg });
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
    const mpIds = receta.ingredientes_receta.map((i) => Number(i.materia_prima_id)).filter(Boolean);
    const mpMeta = mpIds.length
      ? await prisma.materias_primas.findMany({
          where: { id: { in: mpIds } },
          select: { id: true, tipo: true, nombre: true, unidad_medida: true },
        })
      : [];
    const mpTipo = new Map(mpMeta.map((m) => [m.id, String(m.tipo || '').toUpperCase()]));
    const mpUnidad = new Map(mpMeta.map((m) => [m.id, m.unidad_medida || 'ud']));

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
    const fechaRef = parseDateOnlyUTC(new Date());
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

    // rango por fecha (DATE) – usa límites UTC del día para evitar corrimientos
    if (desde || hasta) {
      where.fecha = {};
      if (desde) {
        const d = parseDateOnlyUTC(desde);
        if (d) where.fecha.gte = startOfUTCDate(d);
      }
      if (hasta) {
        const h = parseDateOnlyUTC(hasta);
        if (h) where.fecha.lte = endOfUTCDate(h);
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
 * Incluye CULTIVO (masa madre) aunque no genere movimientos de stock.
 */
async function insumosProduccion(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const prodInfo = await prisma.producciones.findUnique({
      where: { id },
      select: {
        id: true,
        cantidad_producida: true,
        receta_id: true,
        recetas: {
          select: {
            id: true,
            nombre: true,
            ingredientes_receta: {
              select: {
                id: true,
                materia_prima_id: true,
                cantidad: true,
                materias_primas: {
                  select: { id: true, nombre: true, unidad_medida: true, tipo: true },
                },
              },
            },
          },
        },
      },
    });
    if (!prodInfo) return res.status(404).json({ message: 'Producción no encontrada' });

    const movs = await prisma.movimientos_materia_prima.findMany({
      where: { ref_tipo: 'PRODUCCION', ref_id: id, tipo: 'SALIDA' },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        materias_primas: { select: { id: true, nombre: true, unidad_medida: true } },
        lotes: { select: { id: true, codigo: true, fecha_vencimiento: true } },
      },
    });

    const map = new Map();

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
        cantidad: cant.toString(),
      });
      map.set(key, curr);
    }

    const qtyProducida = toDec(prodInfo.cantidad_producida || 0);
    const ings = Array.isArray(prodInfo.recetas?.ingredientes_receta)
      ? prodInfo.recetas.ingredientes_receta
      : [];

    for (const ing of ings) {
      const mp = ing.materias_primas;
      const tipo = String(mp?.tipo || '').toUpperCase();
      if (tipo !== 'CULTIVO') continue;

      const mpId = Number(ing.materia_prima_id);
      const requerido = toDec(ing.cantidad || 0).times(qtyProducida);

      const key = String(mpId);
      const curr = map.get(key) || {
        materia_prima_id: mpId,
        nombre: mp?.nombre || `MP #${mpId}`,
        unidad_base: (mp?.unidad_medida || 'ud').toLowerCase(),
        total: toDec(0),
        detalle: [],
      };

      curr.total = curr.total.plus(requerido);
      curr.detalle.push({
        lote_id: null,
        lote_codigo: null,
        fecha_vencimiento: null,
        cantidad: requerido.toString(),
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
