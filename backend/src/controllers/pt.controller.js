// src/controllers/pt.controller.js
const prisma = require('../database/prismaClient');
const { enqueueMiComercioIngreso } = require('../services/outbox.service');
const { enqueueOutbox } = require('../services/outbox.service');
/* === helpers decimal milésimas === */
const toM = (v) => Math.round(Number(v) * 1000);
const fromM = (m) => (m / 1000).toFixed(3);
const addM = (a, b) => a + b;
const subM = (a, b) => a - b;
const toInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/* === helper fecha/hora (LOCAL, sin UTC implícito) === */
function toDateOrNow(input) {
  if (input === undefined || input === null) return new Date();
  const s = String(input).trim();

  // HH:mm -> hoy a esa hora (local)
  if (/^\d{2}:\d{2}$/.test(s)) {
    const [hh, mm] = s.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  // YYYY-MM-DD -> local 00:00 (NO UTC)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  // ISO con tiempo -> lo que venga
  const d = new Date(s);
  return isNaN(d) ? new Date() : d;
}

/* === helper sumar días === */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

/* === etapas y ventas === */
const VENTAS_ETAPAS = ['EMPAQUE', 'HORNEO']; // solo estas cuentan en stock_total vendible
const ETAPAS = new Set(['CONGELADO', 'EMPAQUE', 'HORNEO']);

/* === comunes === */
const recalcStockPTReady = async (tx, productoId) => {
  const sum = await tx.lotes_producto_terminado.aggregate({
    where: {
      producto_id: productoId,
      estado: { in: ['DISPONIBLE', 'RESERVADO'] },
      etapa: { in: VENTAS_ETAPAS },
    },
    _sum: { cantidad: true },
  });
  await tx.productos_terminados.update({
    where: { id: productoId },
    data: { stock_total: sum._sum.cantidad ?? 0 },
  });
};

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

/* ==== FIFO de empaques ==== */
const consumirEmpaqueFIFO = async (tx, empaqueId, cantidadNecesariaStr, meta = {}) => {
  let restanteM = toM(cantidadNecesariaStr);
  const lotes = await tx.lotes_materia_prima.findMany({
    where: { materia_prima_id: empaqueId, estado: 'DISPONIBLE' },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }],
  });

  for (const lote of lotes) {
    if (restanteM <= 0) break;
    const dispM = toM(lote.cantidad);
    const usarM = Math.min(dispM, restanteM);
    if (usarM > 0) {
      const nuevaM = subM(dispM, usarM);
      await tx.lotes_materia_prima.update({
        where: { id: lote.id },
        data: { cantidad: fromM(nuevaM), estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE' },
      });
      await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'SALIDA',
          materia_prima_id: empaqueId,
          lote_id: lote.id,
          cantidad: fromM(usarM),
          motivo: meta.motivo || 'CONSUMO_EMPAQUE',
          ref_tipo: meta.ref_tipo || 'PT',
          ref_id: meta.ref_id ?? null,
          fecha: meta.fecha ? toDateOrNow(meta.fecha) : new Date(),
        },
      });
      restanteM = subM(restanteM, usarM);
    }
  }
  if (restanteM > 0) {
    throw new Error(`Empaques insuficientes. Faltan ${fromM(restanteM)} ud`);
  }
};

/* ==== bolsas necesarias  ==== */
function calcularBolsasNecesarias(cantidadUnidades, bolsas_por_unidad, unidades_por_empaque) {
  const qty = Math.max(0, Number(cantidadUnidades) || 0);
  const uxe = Number(unidades_por_empaque || 0);
  const bpu = Number(bolsas_por_unidad || 0);

  if (uxe > 0) {
    const paquetes = Math.ceil(qty / uxe);
    const bolsasPorPaquete = bpu > 0 ? bpu : 1;
    return paquetes * bolsasPorPaquete;
  }
  if (bpu > 0) return Math.ceil(qty * bpu);
  return 0;
}

/* ==== config de vencimiento  ==== */
async function getVencimientoConfigForLote(tx, loteId, productoId, base) {
  const mov = await tx.stock_producto_terminado.findFirst({
    where: { lote_id: loteId, tipo: 'ENTRADA', ref_tipo: 'PRODUCCION_PT' },
    orderBy: { id: 'asc' },
    select: { ref_id: true },
  });
  if (mov?.ref_id) {
    const prod = await tx.producciones.findUnique({
      where: { id: mov.ref_id },
      select: { receta_id: true },
    });
    if (prod?.receta_id) {
      const map = await tx.receta_producto_map.findFirst({
        where: { receta_id: prod.receta_id, producto_id: productoId, vencimiento_base: base },
        select: { vida_util_dias: true },
      });
      if (map) return { vida_util_dias: map.vida_util_dias, origen: 'receta' };
    }
  }
  const maps = await tx.receta_producto_map.findMany({
    where: { producto_id: productoId, vencimiento_base: base },
    select: { vida_util_dias: true },
  });
  if (maps.length) {
    const vida = Math.max(...maps.map((m) => Number(m.vida_util_dias || 0)));
    return { vida_util_dias: vida, origen: 'producto' };
  }
  return null;
}

/* === Validación: múltiplo de unidades_por_empaque cuando se empaca === */
function assertMultipleIfEmpaque(producto, cantidad) {
  const uxe = Number(producto?.unidades_por_empaque || 0);
  if (uxe > 0) {
    const qty = Number(cantidad || 0);
    const resto = qty % uxe;
    if (resto !== 0) {
      const paquetes = Math.floor(qty / uxe);
      throw new Error(
        `La cantidad debe ser múltiplo del empaque (${uxe}). ` +
          `Ingresaste ${qty} ud → ${paquetes} paquete(s) de ${uxe} y sobran ${resto} ud.`,
      );
    }
  }
}

/*
   SALIDA PT (se usa para modo simple y modo items[])
   - NO abre transacción (la maneja el controller) */
async function salidaPTCore(tx, payload) {
  let {
    producto_id,
    micomercio_id,
    lote_id,
    loteId,
    cantidad,
    paquetes,
    etapa_preferida,
    motivo = 'SALIDA_PT',
    fecha,
    ref_tipo = 'VENTA',
    ref_id = null,
  } = payload;

  // ⚠️ Fecha normalizada LOCAL (evita -1 día en UI)
  const when = toDateOrNow(fecha);
  const loteIdNorm = Number(lote_id ?? loteId ?? 0) || null;

  // Permitir identificar producto por micomercio_id si no viene producto_id
  if (
    !producto_id &&
    micomercio_id !== undefined &&
    micomercio_id !== null &&
    micomercio_id !== ''
  ) {
    const prod = await tx.productos_terminados.findUnique({
      where: { micomercio_id: Number(micomercio_id) },
      select: { id: true },
    });
    if (!prod) throw new Error(`No existe producto con micomercio_id=${micomercio_id}`);
    producto_id = prod.id;
  }

  /* ---------- SALIDA POR LOTE (manual) ---------- */
  if (loteIdNorm) {
    const lote = await tx.lotes_producto_terminado.findUnique({
      where: { id: loteIdNorm },
      include: {
        productos_terminados: {
          select: { id: true, nombre: true, unidades_por_empaque: true },
        },
      },
    });
    if (!lote) throw new Error('Lote no encontrado');
    if (!VENTAS_ETAPAS.includes(String(lote.etapa)))
      throw new Error('El lote no está en etapa vendible');
    if (lote.fecha_vencimiento && new Date(lote.fecha_vencimiento) < when)
      throw new Error('El lote está vencido');

    let cantidadStr = cantidad;
    if (!cantidadStr && paquetes) {
      const uxe = Number(lote.productos_terminados?.unidades_por_empaque || 0);
      if (!(uxe > 0)) throw new Error('El producto no define unidades_por_empaque');
      cantidadStr = String(Number(paquetes) * uxe);
    }

    const qtyM = toM(cantidadStr || 0);
    if (!(qtyM > 0)) throw new Error('cantidad debe ser > 0');

    const dispM = toM(lote.cantidad);
    if (qtyM > dispM) throw new Error('Stock insuficiente en el lote');

    await tx.stock_producto_terminado.create({
      data: {
        producto_id: lote.producto_id,
        lote_id: lote.id,
        tipo: 'SALIDA',
        cantidad: fromM(qtyM),
        fecha: when,
        motivo,
        ref_tipo,
        ref_id,
      },
    });

    const nuevaM = subM(dispM, qtyM);
    await tx.lotes_producto_terminado.update({
      where: { id: lote.id },
      data: { cantidad: fromM(nuevaM), estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE' },
    });

    await recalcStockPTReady(tx, lote.producto_id);
    return { ok: true, modo: 'LOTE', producto_id: lote.producto_id, lote_id: lote.id };
  }

  /* ---------- SALIDA POR FIFO (producto) ---------- */
  if (!producto_id) throw new Error('producto_id requerido');

  let cantidadStr = cantidad;
  if (!cantidadStr && paquetes) {
    const prod = await tx.productos_terminados.findUnique({
      where: { id: Number(producto_id) },
      select: { unidades_por_empaque: true },
    });
    const uxe = Number(prod?.unidades_por_empaque || 0);
    if (!(uxe > 0)) throw new Error('El producto no define unidades_por_empaque');
    cantidadStr = String(Number(paquetes) * uxe);
  }

  const qtyM = toM(cantidadStr || 0);
  if (!(qtyM > 0)) throw new Error('cantidad debe ser > 0');

  let etapas = VENTAS_ETAPAS;
  const pref = String(etapa_preferida || '').toUpperCase();
  if (pref === 'EMPAQUE' || pref === 'HORNEO') etapas = [pref];

  let restanteM = qtyM;

  const lotes = await tx.lotes_producto_terminado.findMany({
    where: {
      producto_id: Number(producto_id),
      estado: 'DISPONIBLE',
      etapa: { in: etapas },
      OR: [{ fecha_vencimiento: null }, { fecha_vencimiento: { gte: when } }],
      cantidad: { gt: 0 },
    },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }],
  });

  for (const l of lotes) {
    if (restanteM <= 0) break;
    const dispM = toM(l.cantidad);
    const usarM = Math.min(dispM, restanteM);
    if (usarM > 0) {
      await tx.stock_producto_terminado.create({
        data: {
          producto_id: Number(producto_id),
          lote_id: l.id,
          tipo: 'SALIDA',
          cantidad: fromM(usarM),
          motivo,
          ref_tipo,
          ref_id,
          fecha: when,
        },
      });
      const nuevaM = subM(dispM, usarM);
      await tx.lotes_producto_terminado.update({
        where: { id: l.id },
        data: { cantidad: fromM(nuevaM), estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE' },
      });
      restanteM = subM(restanteM, usarM);
    }
  }

  if (restanteM > 0) {
    throw new Error(`Stock insuficiente (vendible). Faltan ${fromM(restanteM)} unidades`);
  }

  await recalcStockPTReady(tx, Number(producto_id));
  return {
    ok: true,
    modo: 'FIFO',
    producto_id: Number(producto_id),
    etapa_preferida: pref || null,
  };
}

/* ===================== CONTROLADORES ===================== */

/* --- SALIDAS PT (FIFO o por LOTE), soporta paquetes y etapa preferida --- */
exports.salidaPT = async (req, res) => {
  try {
    const {
      factura_id,
      id_empresa,
      id_personal,
      motivo: motivoBase = 'SALIDA_PT',
      ref_tipo: refTipoBody,
      ref_id: refIdBody,
    } = req.body;

    const items = Array.isArray(req.body.items) ? req.body.items : null;

    const out = await prisma.$transaction(async (tx) => {
      // ---------- MODO ITEMS ----------
      if (items) {
        if (items.length === 0) throw new Error('items no puede ir vacío');

        const results = [];

        for (let i = 0; i < items.length; i++) {
          const it = items[i] || {};

          const producto_id = it.producto_id;
          const micomercio_id = it.micomercio_id;
          const cantidad = it.cantidad;
          const paquetes = it.paquetes;
          const lote_id = it.lote_id ?? it.loteId;
          const etapa_preferida = it.etapa_preferida;

          if (!producto_id && !micomercio_id) {
            throw new Error(`producto_id o micomercio_id es obligatorio en items[${i}]`);
          }
          if (cantidad === undefined && paquetes === undefined) {
            throw new Error(
              `cantidad o paquetes es obligatorio en items[${i}] (producto_id=${producto_id})`,
            );
          }

          const motivo = [
            it.motivo || motivoBase,
            factura_id ? `FACTURA:${String(factura_id).trim()}` : null,
            id_empresa ? `empresa:${String(id_empresa).trim()}` : null,
            id_personal ? `personal:${String(id_personal).trim()}` : null,
          ]
            .filter(Boolean)
            .join(' | ');

          const r = await salidaPTCore(tx, {
            producto_id,
            micomercio_id,
            cantidad,
            paquetes,
            lote_id,
            etapa_preferida,
            motivo,
            fecha: it.fecha ?? req.body.fecha,
            ref_tipo: it.ref_tipo ?? refTipoBody ?? 'VENTA',
            ref_id: it.ref_id ?? refIdBody ?? null,
          });

          results.push({
            index: i,
            producto_id: r.producto_id,
            micomercio_id: micomercio_id ?? null,
            ...r,
          });
        }

        return {
          ok: true,
          modo: 'ITEMS',
          factura_id: factura_id || null,
          id_empresa: id_empresa || null,
          id_personal: id_personal || null,
          items_procesados: results.length,
          results,
        };
      }

      // ---------- MODO SIMPLE ----------
      const motivo = [
        motivoBase,
        factura_id ? `FACTURA:${String(factura_id).trim()}` : null,
        id_empresa ? `empresa:${String(id_empresa).trim()}` : null,
        id_personal ? `personal:${String(id_personal).trim()}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      return salidaPTCore(tx, {
        ...req.body,
        motivo,
        ref_tipo: refTipoBody ?? req.body.ref_tipo ?? 'VENTA',
        ref_id: refIdBody ?? req.body.ref_id ?? null,
      });
    });

    res.json(out);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* --- LISTAR LOTES --- */
exports.listarLotesPT = async (req, res) => {
  try {
    const { producto_id, etapa, estado, q, include_empty } = req.query;

    const where = {};
    if (producto_id) where.producto_id = Number(producto_id);

    const etapaNorm = etapa ? String(etapa).toUpperCase() : null;
    if (etapaNorm && ETAPAS.has(etapaNorm)) where.etapa = etapaNorm;

    if (estado) {
      where.estado = String(estado).toUpperCase();
    } else {
      where.estado = { in: ['DISPONIBLE', 'RESERVADO', 'INACTIVO', 'AGOTADO', 'VENCIDO'] };
    }

    if (etapaNorm === 'CONGELADO' && String(include_empty).toLowerCase() !== 'true') {
      where.cantidad = { gt: 0 };
    }

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { codigo: { contains: term, mode: 'insensitive' } },
        { productos_terminados: { is: { nombre: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const lotes = await prisma.lotes_producto_terminado.findMany({
      where,
      orderBy: [{ estado: 'asc' }, { fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }],
      include: {
        productos_terminados: { select: { id: true, nombre: true, unidades_por_empaque: true } },
      },
    });

    const enriched = lotes.map((l) => {
      const etapa = String(l.etapa || '').toUpperCase();
      const uds = toInt(l.cantidad);
      const uxe = Number(l.productos_terminados?.unidades_por_empaque || 0);

      let paquetes = null;
      let unidades_restantes = null;
      let display_cantidad = `${uds} ud`;

      if ((etapa === 'EMPAQUE' || etapa === 'HORNEO') && uxe > 0) {
        const pkg = Math.floor(uds / uxe);
        const rest = uds % uxe;
        paquetes = pkg;
        unidades_restantes = rest;
        display_cantidad =
          rest > 0 ? `${pkg} pkg + ${rest} ud (${uds} ud)` : `${pkg} pkg (${uds} ud)`;
      }

      return { ...l, cantidad_ud: uds, paquetes, unidades_restantes, display_cantidad };
    });

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ✅ AJUSTE: ingresarPT y moverEtapa (solo pega estas 2 funciones en tu pt.controller.js)
// Requiere que arriba tengas:
// const { enqueueOutbox } = require('../services/outbox.service');

exports.ingresarPT = async (req, res) => {
  const {
    producto_id,
    cantidad,
    codigo,
    lote_codigo,
    fecha_ingreso,
    fecha_vencimiento,
    etapa_destino,
  } = req.body;

  const code = (lote_codigo || codigo || '').trim();
  const dest = String(etapa_destino || 'EMPAQUE').toUpperCase();

  if (!producto_id || cantidad === undefined || cantidad === null || !code || !fecha_ingreso) {
    return res.status(400).json({ message: 'datos incompletos' });
  }
  if (!['EMPAQUE', 'HORNEO'].includes(dest)) {
    return res.status(400).json({ message: 'etapa_destino inválida' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const prod = await tx.productos_terminados.findUnique({
        where: { id: Number(producto_id) },
        select: {
          id: true,
          estado: true,
          empaque_mp_id: true,
          bolsas_por_unidad: true,
          unidades_por_empaque: true,
          micomercio_id: true,
        },
      });
      if (!prod || prod.estado === false) throw new Error('Producto no encontrado o inactivo');

      // Validar múltiplo SOLO si la entrada va a EMPAQUE
      if (dest === 'EMPAQUE') assertMultipleIfEmpaque(prod, cantidad);

      // Consumir bolsas SOLO si va a EMPAQUE y el producto tiene empaque definido
      if (dest === 'EMPAQUE' && prod.empaque_mp_id) {
        const bolsasNecesarias = calcularBolsasNecesarias(
          Number(cantidad),
          prod.bolsas_por_unidad,
          prod.unidades_por_empaque,
        );
        if (bolsasNecesarias > 0) {
          await consumirEmpaqueFIFO(tx, prod.empaque_mp_id, String(bolsasNecesarias), {
            motivo: 'CONSUMO_POR_INGRESO_PT',
            ref_tipo: 'PT_INGRESO',
            fecha: toDateOrNow(fecha_ingreso),
          });
          await recalcStockMP(tx, prod.empaque_mp_id);
        }
      }

      // Buscar/crear lote (producto + codigo + etapa)
      let lote = await tx.lotes_producto_terminado.findFirst({
        where: { producto_id: Number(producto_id), codigo: code, etapa: dest },
      });

      if (!lote) {
        lote = await tx.lotes_producto_terminado.create({
          data: {
            producto_id: Number(producto_id),
            codigo: code,
            cantidad: '0.000',
            fecha_ingreso: toDateOrNow(fecha_ingreso),
            fecha_vencimiento: fecha_vencimiento ? toDateOrNow(fecha_vencimiento) : null,
            estado: 'DISPONIBLE',
            etapa: dest,
          },
        });
      }

      // Movimiento ENTRADA
      await tx.stock_producto_terminado.create({
        data: {
          producto_id: Number(producto_id),
          lote_id: lote.id,
          tipo: 'ENTRADA',
          cantidad: String(cantidad),
          fecha: toDateOrNow(fecha_ingreso),
          motivo: 'INGRESO_PT',
          ref_tipo: 'PT_INGRESO',
          ref_id: null,
        },
      });

      // Sumar al lote
      const nuevaM = addM(toM(lote.cantidad), toM(cantidad));
      lote = await tx.lotes_producto_terminado.update({
        where: { id: lote.id },
        data: {
          cantidad: fromM(nuevaM),
          estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE',
        },
      });

      // Recalcular stock vendible
      await recalcStockPTReady(tx, Number(producto_id));

      // ✅ Encolar ingreso a MiComercio SOLO si etapa vendible (EMPAQUE/HORNEO)
      if (['EMPAQUE', 'HORNEO'].includes(dest)) {
        const prodMico = await tx.productos_terminados.findUnique({
          where: { id: Number(producto_id) },
          select: { micomercio_id: true },
        });

        if (prodMico?.micomercio_id) {
          const payload = {
            IdUser: Number(process.env.MICOMERCIO_IDUSER || 0),
            IdProduccion: lote.id,
            details: [
              {
                IdProducto: String(prodMico.micomercio_id),
                Cantidad: Number(cantidad),
                Comentarios: `Ingreso PT ${dest} (lote ${code})`,
              },
            ],
          };

          await enqueueOutbox(tx, {
            tipo: 'INGRESO_PT',
            ref_id: lote.id,
            payload,
          });
        }
      }

      return { lote_id: lote.id, producto_id: Number(producto_id), etapa: dest };
    });

    res.json(out);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({
        message:
          'Código de lote ya usado para este producto. Si quieres tener el mismo código en otra etapa, aplica la migración que hace único (producto,codigo,etapa).',
      });
    }
    res.status(400).json({ message: e.message });
  }
};

exports.moverEtapa = async (req, res) => {
  const id = Number(req.params.id || req.body.lote_id);
  const { nueva_etapa, cantidad, fecha } = req.body;

  const dest = String(nueva_etapa || '').toUpperCase();
  const ETAPAS_VALIDAS = new Set(['CONGELADO', 'EMPAQUE', 'HORNEO']);
  if (!ETAPAS_VALIDAS.has(dest)) return res.status(400).json({ message: 'nueva_etapa inválida' });

  const qty = Number(cantidad || 0);
  if (!(qty > 0)) return res.status(400).json({ message: 'cantidad debe ser > 0' });

  try {
    const out = await prisma.$transaction(async (tx) => {
      const src = await tx.lotes_producto_terminado.findUnique({
        where: { id },
        include: {
          productos_terminados: {
            select: {
              id: true,
              nombre: true,
              empaque_mp_id: true,
              bolsas_por_unidad: true,
              unidades_por_empaque: true,
              requiere_congelacion_previa: true,
              micomercio_id: true,
            },
          },
        },
      });
      if (!src) throw new Error('Lote origen no encontrado');

      // Solo mover DESDE CONGELADO
      const srcEtapa = String(src.etapa || '').toUpperCase();
      if (src.estado !== 'DISPONIBLE' || Number(src.cantidad) <= 0) {
        throw new Error('El lote origen no está disponible');
      }
      if (srcEtapa !== 'CONGELADO') {
        throw new Error('Solo se permite mover desde CONGELADO');
      }
      if (!['EMPAQUE', 'HORNEO'].includes(dest)) {
        throw new Error('Transición inválida: debe ser a EMPAQUE u HORNEO');
      }
      if (qty > Number(src.cantidad)) {
        throw new Error('Cantidad a mover mayor al disponible del lote');
      }

      // Si vamos a EMPAQUE, exigir múltiplo de unidades_por_empaque
      if (dest === 'EMPAQUE') {
        const uxe = Number(src.productos_terminados?.unidades_por_empaque || 0);
        if (uxe > 0 && qty % uxe !== 0) {
          const paquetes = Math.floor(qty / uxe);
          const resto = qty % uxe;
          throw new Error(
            `La cantidad debe ser múltiplo del empaque (${uxe}). ` +
              `Ingresaste ${qty} ud → ${paquetes} paquete(s) y sobran ${resto} ud.`,
          );
        }
      }

      const fechaMov = toDateOrNow(fecha);

      // Código destino: “-E” para EMPAQUE o “-H” para HORNEO
      const suf = dest === 'EMPAQUE' ? 'E' : 'H';
      const codigoDestino = `${src.codigo}-${suf}`;

      // upsert destino por (producto,codigo,etapa) (tu uq_ptprod_codigo_etapa)
      let dst = await tx.lotes_producto_terminado.findFirst({
        where: { producto_id: src.producto_id, codigo: codigoDestino, etapa: dest },
      });

      if (!dst) {
        dst = await tx.lotes_producto_terminado.create({
          data: {
            producto_id: src.producto_id,
            codigo: codigoDestino,
            cantidad: '0.000',
            fecha_ingreso: fechaMov,
            fecha_vencimiento: null,
            estado: 'DISPONIBLE',
            etapa: dest,
          },
        });
      }

      // SALIDA del origen (CONGELADO)
      const srcDispM = toM(src.cantidad);
      const moverM = toM(qty);
      const nuevaSrcM = subM(srcDispM, moverM);

      await tx.stock_producto_terminado.create({
        data: {
          producto_id: src.producto_id,
          lote_id: src.id,
          tipo: 'SALIDA',
          cantidad: fromM(moverM),
          fecha: fechaMov,
          motivo: `Cambio etapa CONGELADO→${dest}`,
          ref_tipo: 'CAMBIO_ETAPA',
          ref_id: dst.id,
        },
      });

      await tx.lotes_producto_terminado.update({
        where: { id: src.id },
        data: {
          cantidad: fromM(nuevaSrcM),
          estado: nuevaSrcM === 0 ? 'AGOTADO' : 'DISPONIBLE',
        },
      });

      // CONSUMO DE EMPAQUES (solo si destino = EMPAQUE)
      let bolsasConsumidas = 0;
      if (dest === 'EMPAQUE' && src.productos_terminados?.empaque_mp_id) {
        const bolsasNecesarias = calcularBolsasNecesarias(
          qty,
          src.productos_terminados.bolsas_por_unidad,
          src.productos_terminados.unidades_por_empaque,
        );
        if (bolsasNecesarias > 0) {
          await consumirEmpaqueFIFO(
            tx,
            src.productos_terminados.empaque_mp_id,
            String(bolsasNecesarias),
            {
              motivo: `Empaque por cambio de etapa a EMPAQUE (lote ${codigoDestino})`,
              ref_tipo: 'CAMBIO_ETAPA',
              ref_id: dst.id,
              fecha: fechaMov,
            },
          );
          await recalcStockMP(tx, src.productos_terminados.empaque_mp_id);
          bolsasConsumidas = bolsasNecesarias;
        }
      }

      // Actualizar destino cantidad + vencimiento heredado
      const nuevaDstM = addM(toM(dst.cantidad), moverM);
      const dstVto = dst.fecha_vencimiento || src.fecha_vencimiento || null;

      dst = await tx.lotes_producto_terminado.update({
        where: { id: dst.id },
        data: {
          cantidad: fromM(nuevaDstM),
          estado: 'DISPONIBLE',
          etapa: dest,
          // mantén fecha_ingreso original del destino si ya existía
          fecha_ingreso: dst.fecha_ingreso || fechaMov,
          ...(dstVto ? { fecha_vencimiento: dstVto } : {}),
        },
      });

      // ENTRADA en destino
      await tx.stock_producto_terminado.create({
        data: {
          producto_id: src.producto_id,
          lote_id: dst.id,
          tipo: 'ENTRADA',
          cantidad: String(qty),
          fecha: fechaMov,
          motivo: `Cambio etapa CONGELADO→${dest}`,
          ref_tipo: 'CAMBIO_ETAPA',
          ref_id: src.id,
        },
      });

      // Recalcular stock vendible
      await recalcStockPTReady(tx, src.producto_id);

      // ✅ Encolar ingreso a MiComercio (destino vendible + producto mapeado)
      const micoId = src.productos_terminados?.micomercio_id;
      if (micoId && ['EMPAQUE', 'HORNEO'].includes(dest)) {
        const payload = {
          IdUser: Number(process.env.MICOMERCIO_IDUSER || 0),
          IdProduccion: dst.id,
          details: [
            {
              IdProducto: String(micoId),
              Cantidad: Number(qty),
              Comentarios: `Cambio etapa CONGELADO→${dest} (origen ${src.codigo} destino ${codigoDestino})`,
            },
          ],
        };

        await enqueueOutbox(tx, {
          tipo: 'INGRESO_PT',
          ref_id: dst.id,
          payload,
        });
      }

      return {
        origen: {
          id: src.id,
          codigo: src.codigo,
          etapa: srcEtapa,
          cantidad_antes: src.cantidad,
          cantidad_despues: fromM(nuevaSrcM),
        },
        destino: {
          id: dst.id,
          codigo: codigoDestino,
          etapa: dest,
          agregado: String(qty),
          fecha_vencimiento: dstVto || null,
        },
        empaques_consumidos: bolsasConsumidas || 0,
      };
    });

    res.json({ message: 'Etapa actualizada', ...out });
  } catch (e) {
    console.error('[pt.moverEtapa]', e);
    res.status(400).json({ message: e.message });
  }
};

// --- ACTUALIZAR LOTE (codigo/fechas, AJUSTE de cantidad y cambio de ETAPA) ---
exports.actualizarLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      codigo,
      fecha_ingreso,
      fecha_vencimiento,
      cantidad,
      cantidad_delta,
      motivo_ajuste,
      fecha_ajuste,
      paquetes,
      sueltas,
      etapa,
    } = req.body;

    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      include: { productos_terminados: { select: { unidades_por_empaque: true } } },
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    let newCantidad = undefined;
    const uxe = Number(lote.productos_terminados?.unidades_por_empaque || 0);

    if (uxe > 0 && (paquetes !== undefined || sueltas !== undefined)) {
      const pk = Number(paquetes || 0);
      const su = Number(sueltas || 0);
      if (Number.isFinite(pk) && pk >= 0 && Number.isFinite(su) && su >= 0) {
        newCantidad = pk * uxe + su;
      }
    }
    if (cantidad !== undefined) {
      const c = Number(cantidad);
      if (!Number.isFinite(c) || c < 0)
        return res.status(400).json({ message: 'cantidad inválida' });
      newCantidad = c;
    }
    if (newCantidad === undefined && cantidad_delta !== undefined) {
      const d = Number(cantidad_delta);
      if (!Number.isFinite(d)) return res.status(400).json({ message: 'cantidad_delta inválida' });
      newCantidad = Math.max(0, Math.round(Number(lote.cantidad || 0)) + d);
    }
    if (newCantidad !== undefined && (!Number.isFinite(newCantidad) || newCantidad < 0)) {
      return res.status(400).json({ message: 'cantidad inválida' });
    }

    const hasFV = Object.prototype.hasOwnProperty.call(req.body, 'fecha_vencimiento');
    const baseUpdate = {};
    if (codigo !== undefined) baseUpdate.codigo = String(codigo).trim();
    if (fecha_ingreso !== undefined)
      baseUpdate.fecha_ingreso = fecha_ingreso ? toDateOrNow(fecha_ingreso) : null;
    if (hasFV)
      baseUpdate.fecha_vencimiento = fecha_vencimiento ? toDateOrNow(fecha_vencimiento) : null;
    if (etapa !== undefined) {
      const e = String(etapa).toUpperCase();
      if (!['EMPAQUE', 'HORNEO', 'CONGELADO'].includes(e))
        return res.status(400).json({ message: 'etapa inválida' });
      baseUpdate.etapa = e;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newCantidad !== undefined && newCantidad !== Math.round(Number(lote.cantidad))) {
        const actualM = Math.round(Number(lote.cantidad) * 1000);
        const targetM = Math.round(Number(newCantidad) * 1000);
        const deltaM = targetM - actualM;

        const nuevoEstado =
          targetM <= 0 ? 'AGOTADO' : lote.estado === 'INACTIVO' ? 'INACTIVO' : 'DISPONIBLE';

        await tx.lotes_producto_terminado.update({
          where: { id },
          data: { ...baseUpdate, cantidad: (targetM / 1000).toFixed(3), estado: nuevoEstado },
        });

        await tx.stock_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            lote_id: lote.id,
            tipo: 'AJUSTE',
            cantidad: (Math.abs(deltaM) / 1000).toFixed(3),
            fecha: fecha_ajuste ? toDateOrNow(fecha_ajuste) : new Date(),
            motivo: (motivo_ajuste && String(motivo_ajuste).trim()) || 'Ajuste manual',
            ref_tipo: 'AJUSTE_PT',
            ref_id: lote.id,
          },
        });
      } else if (Object.keys(baseUpdate).length) {
        await tx.lotes_producto_terminado.update({ where: { id }, data: baseUpdate });
      }

      const etapaFinal = baseUpdate.etapa ?? lote.etapa;
      if (['EMPAQUE', 'HORNEO'].includes(String(etapaFinal))) {
        await recalcStockPTReady(tx, lote.producto_id);
      }

      return tx.lotes_producto_terminado.findUnique({
        where: { id },
        include: {
          productos_terminados: { select: { id: true, nombre: true, unidades_por_empaque: true } },
        },
      });
    });

    res.json({ message: 'Lote actualizado', lote: updated });
  } catch (e) {
    if (e.code === 'P2002')
      return res.status(409).json({ message: 'Código de lote ya usado para ese producto' });
    res.status(400).json({ message: e.message || 'Error actualizando lote' });
  }
};

// === liberar unidades desde CONGELADO (descarga como LIBERACION) ===
exports.liberarCongelado = async (req, res) => {
  try {
    const { lote_id, cantidad, fecha } = req.body;
    const id = Number(lote_id || 0);
    const qty = Math.round(Number(cantidad || 0));

    if (!id) return res.status(400).json({ message: 'lote_id requerido' });
    if (!(qty > 0)) return res.status(400).json({ message: 'cantidad debe ser > 0' });

    const out = await prisma.$transaction(async (tx) => {
      const lote = await tx.lotes_producto_terminado.findUnique({
        where: { id },
        select: { id: true, producto_id: true, etapa: true, estado: true, cantidad: true },
      });
      if (!lote) throw new Error('Lote no encontrado');
      if (String(lote.etapa).toUpperCase() !== 'CONGELADO')
        throw new Error('Solo se puede liberar desde la etapa CONGELADO');
      if (lote.estado !== 'DISPONIBLE') throw new Error('El lote no está disponible');

      const dispM = toM(lote.cantidad);
      const usarM = toM(qty);
      if (usarM > dispM) throw new Error('Cantidad a liberar mayor al disponible');

      const when = toDateOrNow(fecha);

      await tx.stock_producto_terminado.create({
        data: {
          producto_id: lote.producto_id,
          lote_id: lote.id,
          tipo: 'SALIDA',
          cantidad: fromM(usarM),
          fecha: when,
          motivo: 'LIBERACION',
          ref_tipo: 'LIBERACION',
          ref_id: lote.id,
        },
      });

      const nuevaM = subM(dispM, usarM);
      const upd = await tx.lotes_producto_terminado.update({
        where: { id: lote.id },
        data: { cantidad: fromM(nuevaM), estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE' },
      });

      return {
        lote_id: upd.id,
        producto_id: upd.producto_id,
        cantidad_liberada: String(qty),
        cantidad_restante: upd.cantidad,
      };
    });

    res.json({ message: 'Unidades liberadas', ...out });
  } catch (e) {
    console.error('[pt.liberarCongelado]', e);
    res.status(400).json({ message: e.message || 'Error liberando unidades' });
  }
};

/* --- TOGGLE ESTADO --- */
exports.toggleEstadoLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;

    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      select: { id: true, producto_id: true, cantidad: true, etapa: true, estado: true },
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    let nuevoEstado;
    if (estado) {
      const up = String(estado).toUpperCase();
      const allowed = new Set(['DISPONIBLE', 'RESERVADO', 'AGOTADO', 'VENCIDO', 'INACTIVO']);
      if (!allowed.has(up)) return res.status(400).json({ message: 'estado inválido' });
      nuevoEstado =
        up === 'DISPONIBLE' ? (Number(lote.cantidad) > 0 ? 'DISPONIBLE' : 'AGOTADO') : up;
    } else {
      nuevoEstado =
        lote.estado === 'INACTIVO'
          ? Number(lote.cantidad) > 0
            ? 'DISPONIBLE'
            : 'AGOTADO'
          : 'INACTIVO';
    }

    const updated = await prisma.lotes_producto_terminado.update({
      where: { id },
      data: { estado: nuevoEstado },
      select: { id: true, estado: true, producto_id: true, etapa: true },
    });

    if (VENTAS_ETAPAS.includes(String(updated.etapa))) {
      await recalcStockPTReady(prisma, updated.producto_id);
    }

    res.json({ lote: updated });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* --- ELIMINAR LOTE --- */
exports.eliminarLote = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const salidas = await prisma.stock_producto_terminado.count({
      where: { lote_id: id, tipo: 'SALIDA' },
    });
    if (salidas > 0) {
      return res
        .status(409)
        .json({ message: 'No se puede eliminar: el lote tiene salidas registradas' });
    }

    const lote = await prisma.lotes_producto_terminado.delete({
      where: { id },
      select: { producto_id: true, etapa: true },
    });

    if (VENTAS_ETAPAS.includes(String(lote.etapa))) {
      await recalcStockPTReady(prisma, lote.producto_id);
    }

    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2003')
      return res
        .status(409)
        .json({ message: 'No se puede eliminar: el lote tiene movimientos asociados' });
    res.status(400).json({ message: e.message });
  }
};

/* --- LISTAR MOVIMIENTOS PT --- */
// pt.controller.js
exports.listarMovimientosPT = async (req, res) => {
  try {
    const { q, producto_id, tipo, desde, hasta, pageSize = '300' } = req.query;

    const where = {};
    if (producto_id) where.producto_id = Number(producto_id);
    if (tipo && ['ENTRADA', 'SALIDA', 'AJUSTE'].includes(String(tipo).toUpperCase())) {
      where.tipo = String(tipo).toUpperCase();
    }

    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = toDateOrNow(desde);
      if (hasta) {
        const h = toDateOrNow(hasta);
        h.setHours(23, 59, 59, 999);
        where.fecha.lte = h;
      }
    }

    const take = Math.max(1, Math.min(Number(pageSize) || 300, 500));

    const [total, rows] = await Promise.all([
      prisma.stock_producto_terminado.count({ where }),
      prisma.stock_producto_terminado.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          fecha: true,
          producto_id: true,
          lote_id: true,
          tipo: true,
          cantidad: true,
          motivo: true,
          ref_tipo: true,
          ref_id: true,
        },
      }),
    ]);

    const prodIds = Array.from(new Set(rows.map((r) => r.producto_id).filter(Boolean)));
    const loteIds = Array.from(new Set(rows.map((r) => r.lote_id).filter(Boolean)));

    const refIds = Array.from(
      new Set(
        rows
          .map((r) => r.ref_id)
          .filter((x) => x !== null && x !== undefined)
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0),
      ),
    );

    // buscamos por ref_id (y por lote_id como fallback)
    const outboxIds = Array.from(new Set([...refIds, ...loteIds].map(Number).filter(Boolean)));

    const [prods, lotes, outbox] = await Promise.all([
      prodIds.length
        ? prisma.productos_terminados.findMany({
            where: { id: { in: prodIds } },
            select: { id: true, nombre: true, unidades_por_empaque: true },
          })
        : Promise.resolve([]),

      loteIds.length
        ? prisma.lotes_producto_terminado.findMany({
            where: { id: { in: loteIds } },
            select: { id: true, codigo: true },
          })
        : Promise.resolve([]),

      outboxIds.length
        ? prisma.integracion_outbox.findMany({
            where: {
              proveedor: 'MICOMERCIO',
              ref_id: { in: outboxIds },
            },
            orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              ref_id: true,
              tipo: true,
              estado: true,
              intentos: true,
              last_error: true,
              last_status: true,
              last_resp: true,
              updated_at: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const prodMap = new Map(prods.map((p) => [p.id, p]));
    const loteMap = new Map(lotes.map((l) => [l.id, l.codigo]));

    // ✅ mejor: map por (tipo|ref_id) y por ref_id
    const outboxByKey = new Map(); // `${tipo}|${ref_id}` -> row más reciente
    const outboxByRef = new Map(); // ref_id -> row más reciente

    for (const r of outbox) {
      const key = `${String(r.tipo || '').toUpperCase()}|${Number(r.ref_id)}`;
      if (!outboxByKey.has(key)) outboxByKey.set(key, r);
      if (!outboxByRef.has(r.ref_id)) outboxByRef.set(r.ref_id, r);
    }

    const term = (q || '').trim().toLowerCase();

    const items = rows
      .map((m) => {
        const prod = prodMap.get(m.producto_id) || null;

        // Heurística de tipo outbox esperado según ref_tipo
        const refTipo = String(m.ref_tipo || '').toUpperCase();
        const expectedOutboxTipo = refTipo === 'PRODUCCION_PT' ? 'INGRESO_PT' : refTipo; // CAMBIO_ETAPA -> CAMBIO_ETAPA (si así lo guardas)

        const byRefKey = m.ref_id
          ? outboxByKey.get(`${expectedOutboxTipo}|${Number(m.ref_id)}`)
          : null;

        // fallback: por ref_id sin tipo
        const byRefOnly = m.ref_id ? outboxByRef.get(Number(m.ref_id)) : null;

        // fallback extra: por lote_id
        const byLote = m.lote_id ? outboxByRef.get(Number(m.lote_id)) : null;

        const o = byRefKey || byRefOnly || byLote || null;

        return {
          id: m.id,
          fecha: m.fecha,
          producto_id: m.producto_id,
          producto_nombre: prod?.nombre || null,
          unidades_por_empaque: prod?.unidades_por_empaque ?? null,

          lote_id: m.lote_id,
          lote_codigo: m.lote_id ? loteMap.get(m.lote_id) || null : null,

          tipo: m.tipo,
          cantidad: m.cantidad,
          motivo: m.motivo || null,
          ref_tipo: m.ref_tipo || null,
          ref_id: m.ref_id || null,

          // ✅ clave para reintentar desde UI
          micomercio_outbox_id: o?.id ?? null,

          micomercio_estado: o?.estado || null,
          micomercio_tipo: o?.tipo || null,
          micomercio_intentos: o?.intentos ?? null,
          micomercio_last_error: o?.last_error || null,
          micomercio_last_status: o?.last_status ?? null,
          micomercio_updated_at: o?.updated_at || null,
          micomercio_last_resp: o?.last_resp ?? null,
        };
      })
      .filter((m) => {
        if (!term) return true;
        const lote = (m.lote_codigo || '').toLowerCase();
        const motivo = (m.motivo || '').toLowerCase();
        const prodName = (m.producto_nombre || '').toLowerCase();
        const mc = String(m.micomercio_estado || '').toLowerCase();
        return (
          prodName.includes(term) ||
          lote.includes(term) ||
          motivo.includes(term) ||
          mc.includes(term)
        );
      });

    res.json({ total, items });
  } catch (e) {
    console.error('[listarMovimientosPT]', e);
    res.status(500).json({ message: e?.message || 'Error listando movimientos PT' });
  }
};
// ✅ GET /api/pt/lotes/:id  (IdProduccion = id del lote PT)
exports.obtenerLotePT = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      include: {
        productos_terminados: {
          select: { id: true, nombre: true, micomercio_id: true, unidades_por_empaque: true },
        },
      },
    });

    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    res.json(lote);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ✅ GET /api/pt/lotes/:id/movimientos  (auditoría por lote)
exports.movimientosPorLotePT = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const items = await prisma.stock_producto_terminado.findMany({
      where: { lote_id: id },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        fecha: true,
        producto_id: true,
        lote_id: true,
        tipo: true,
        cantidad: true,
        motivo: true,
        ref_tipo: true,
        ref_id: true,
      },
    });

    res.json({ lote_id: id, total: items.length, items });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ✅ GET /api/pt/stock?micomercio_id=442479
exports.stockPorMicomercioId = async (req, res) => {
  try {
    const micomercio_id = Number(req.query.micomercio_id);
    if (!micomercio_id) return res.status(400).json({ message: 'micomercio_id requerido' });

    const prod = await prisma.productos_terminados.findUnique({
      where: { micomercio_id },
      select: { id: true, nombre: true, micomercio_id: true, stock_total: true },
    });

    if (!prod) return res.status(404).json({ message: 'Producto no encontrado' });

    // stock_total ya es vendible (EMPAQUE/HORNEO) por tu recalcStockPTReady
    res.json({
      producto_id: prod.id,
      micomercio_id: prod.micomercio_id,
      nombre: prod.nombre,
      stock_vendible: prod.stock_total,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
