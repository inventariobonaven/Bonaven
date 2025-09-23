// src/controllers/pt.controller.js
const prisma = require('../database/prismaClient');

/* === helpers decimal milésimas === */
const toM = (v) => Math.round(Number(v) * 1000);
const fromM = (m) => (m / 1000).toFixed(3);
const addM = (a, b) => a + b;
const subM = (a, b) => a - b;
const toInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/* === helper fecha/hora === */
function toDateOrNow(input) {
  if (input === undefined || input === null) return new Date();
  const s = String(input).trim();

  if (/^\d{2}:\d{2}$/.test(s)) {
    const [hh, mm] = s.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
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
          fecha: meta.fecha || new Date(),
        },
      });
      restanteM = subM(restanteM, usarM);
    }
  }
  if (restanteM > 0) {
    throw new Error(`Empaques insuficientes. Faltan ${fromM(restanteM)} ud`);
  }
};

/* ==== bolsas necesarias (preferir paquetes) ==== */
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

/* ==== config de vencimiento (compat) ==== */
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

/* === Validación: múltiplo de unidades_por_empaque cuando se EMPAQUEA === */
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

/* ===================== CONTROLADORES ===================== */

/* --- ENTRADAS de PT (manuales) --- */
/* --- ENTRADAS de PT (manuales) --- */
/* Soporta etapa destino:
   - etapa: 'HORNEO'  -> permite cualquier cantidad, NO consume bolsas
   - etapa: 'EMPAQUE' -> exige múltiplo de unidades_por_empaque y SÍ consume bolsas
   (por defecto: 'EMPAQUE' para mantener compatibilidad) */
// --- ENTRADAS de PT (manuales) ---
// Acepta etapa_destino: 'EMPAQUE' | 'HORNEO'
// - En EMPAQUE: valida múltiplos y consume bolsas.
// - En HORNEO: NO valida múltiplos y NO consume bolsas.
// --- ENTRADAS de PT (manuales) ---
// Acepta etapa_destino: 'EMPAQUE' | 'HORNEO'
// - En EMPAQUE: valida múltiplos y consume bolsas.
// - En HORNEO: NO valida múltiplos y NO consume bolsas.
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

  if (!producto_id || !cantidad || !code || !fecha_ingreso) {
    return res.status(400).json({ message: 'datos incompletos' });
  }
  if (!['EMPAQUE', 'HORNEO'].includes(dest)) {
    return res.status(400).json({ message: 'etapa_destino inválida' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const prod = await tx.productos_terminados.findUnique({ where: { id: Number(producto_id) } });
      if (!prod || prod.estado === false) throw new Error('Producto no encontrado o inactivo');

      // Validar múltiplo SOLO si la entrada va a EMPAQUE
      if (dest === 'EMPAQUE') {
        assertMultipleIfEmpaque(prod, cantidad);
      }

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
            fecha: new Date(fecha_ingreso),
          });
          await recalcStockMP(tx, prod.empaque_mp_id);
        }
      }

      // ⬇️ Buscar por producto+codigo+ETAPA (separado)
      let lote = await tx.lotes_producto_terminado.findFirst({
        where: { producto_id: Number(producto_id), codigo: code, etapa: dest },
      });
      if (!lote) {
        lote = await tx.lotes_producto_terminado.create({
          data: {
            producto_id: Number(producto_id),
            codigo: code,
            cantidad: '0.000',
            fecha_ingreso: new Date(fecha_ingreso),
            fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
            estado: 'DISPONIBLE',
            etapa: dest, // EMPAQUE u HORNEO
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
          fecha: new Date(fecha_ingreso),
          motivo: 'INGRESO_PT',
          ref_tipo: 'PT_INGRESO',
        },
      });

      // Sumar al lote
      const nuevaM = addM(toM(lote.cantidad), toM(cantidad));
      lote = await tx.lotes_producto_terminado.update({
        where: { id: lote.id },
        data: { cantidad: fromM(nuevaM), estado: 'DISPONIBLE' },
      });

      await recalcStockPTReady(tx, Number(producto_id));
      return { lote_id: lote.id, producto_id: Number(producto_id), etapa: dest };
    });

    res.json(out);
  } catch (e) {
    if (e.code === 'P2002') {
      // Esto solo debería ocurrir si NO migraste la unicidad a (producto,codigo,etapa)
      return res.status(409).json({
        message:
          'Código de lote ya usado para este producto. Si quieres tener el mismo código en otra etapa, debes aplicar la migración que hace único (producto,codigo,etapa).',
      });
    }
    res.status(400).json({ message: e.message });
  }
};

/* --- SALIDAS PT (FIFO o por LOTE), soporta paquetes y etapa preferida --- */
exports.salidaPT = async (req, res) => {
  try {
    let {
      producto_id,
      lote_id,
      loteId,
      cantidad,
      paquetes,
      etapa_preferida,
      motivo = 'SALIDA_PT',
      fecha,
    } = req.body;

    const when = fecha ? new Date(fecha) : new Date();
    const loteIdNorm = Number(lote_id ?? loteId ?? 0) || null;

    const out = await prisma.$transaction(async (tx) => {
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
        if (lote.fecha_vencimiento && new Date(lote.fecha_vencimiento) < when) {
          throw new Error('El lote está vencido');
        }

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
            ref_tipo: 'VENTA',
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
              ref_tipo: 'VENTA',
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
    });

    res.json(out);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/**
 * LISTAR LOTES (con filtros)
 * - Devuelve además:
 *   - cantidad_ud (entero), paquetes (entero o null), unidades_restantes
 *   - display_cantidad: "N pkg + R ud (U ud)" cuando aplica
 */
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
        productos_terminados: {
          select: { id: true, nombre: true, unidades_por_empaque: true },
        },
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

      return {
        ...l,
        cantidad_ud: uds,
        paquetes,
        unidades_restantes,
        display_cantidad,
      };
    });

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/* --- MOVER ETAPA (CONGELADO -> EMPAQUE | HORNEO) --- */
/* --- MOVER ETAPA (CONGELADO -> EMPAQUE | HORNEO) --- */
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
            },
          },
        },
      });
      if (!src) throw new Error('Lote origen no encontrado');

      // Solo mover DESDE CONGELADO (como definiste el flujo)
      const srcEtapa = String(src.etapa || 'EMPAQUE').toUpperCase();
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

      // Reusar un código por destino: “-E” para EMPAQUE o “-H” para HORNEO
      const suf = dest === 'EMPAQUE' ? 'E' : 'H';
      const codigoDestino = `${src.codigo}-${suf}`;

      // upsert lote destino
      let dst = await tx.lotes_producto_terminado.findFirst({
        where: { producto_id: src.producto_id, codigo: codigoDestino },
      });
      if (!dst) {
        dst = await tx.lotes_producto_terminado.create({
          data: {
            producto_id: src.producto_id,
            codigo: codigoDestino,
            cantidad: '0.000',
            fecha_ingreso: fechaMov,
            fecha_vencimiento: null, // se hereda/establece más abajo si corresponde
            estado: 'DISPONIBLE',
            etapa: dest,
          },
        });
      } else if (dst.etapa !== dest) {
        await tx.lotes_producto_terminado.update({
          where: { id: dst.id },
          data: { etapa: dest },
        });
      }

      // SALIDA del lote origen (CONGELADO)
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
        data: { cantidad: fromM(nuevaSrcM), estado: nuevaSrcM === 0 ? 'AGOTADO' : 'DISPONIBLE' },
      });

      // ENTRADA en lote destino
      const nuevaDstM = addM(toM(dst.cantidad), moverM);

      // ⚠️ CONSUMO DE EMPAQUES:
      //   - Solo si destino = EMPAQUE
      //   - Si destino = HORNEO → NO consume bolsas (tal como pediste)
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

      // FECHA DE VENCIMIENTO: usa la del origen si el destino no la tenía
      const dstVto = dst.fecha_vencimiento || src.fecha_vencimiento || null;

      await tx.lotes_producto_terminado.update({
        where: { id: dst.id },
        data: {
          cantidad: fromM(nuevaDstM),
          etapa: dest,
          fecha_ingreso: dst.fecha_ingreso || fechaMov,
          estado: 'DISPONIBLE',
          ...(dstVto ? { fecha_vencimiento: dstVto } : {}),
        },
      });

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

      // Recalcular el stock "vendible" (EMPAQUE + HORNEO)
      await recalcStockPTReady(tx, src.producto_id);

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
      fecha_vencimiento, // puede ser null para limpiar; si no viene, NO se toca
      cantidad, // valor final absoluto (ud)
      cantidad_delta, // delta +/- (ud)
      motivo_ajuste,
      fecha_ajuste,
      paquetes, // opcional: si hay uxe>0
      sueltas, // opcional: unidades sueltas
      etapa, // 👈 NUEVO: permitir cambiar etapa (EMPAQUE/HORNEO/CONGELADO)
    } = req.body;

    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      include: {
        productos_terminados: { select: { unidades_por_empaque: true } },
      },
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    // ---- Resolver nueva cantidad (en unidades, no milésimas)
    let newCantidad = undefined; // 👈 aseguro que SIEMPRE existe
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

    // ---- Fechas y etapa: solo tocar si vienen en el body
    const hasFV = Object.prototype.hasOwnProperty.call(req.body, 'fecha_vencimiento');
    const baseUpdate = {};
    if (codigo !== undefined) baseUpdate.codigo = String(codigo).trim();
    if (fecha_ingreso !== undefined) {
      baseUpdate.fecha_ingreso = fecha_ingreso ? new Date(fecha_ingreso) : null;
    }
    if (hasFV) {
      baseUpdate.fecha_vencimiento = fecha_vencimiento ? new Date(fecha_vencimiento) : null;
    }
    if (etapa !== undefined) {
      const e = String(etapa).toUpperCase();
      if (!['EMPAQUE', 'HORNEO', 'CONGELADO'].includes(e)) {
        return res.status(400).json({ message: 'etapa inválida' });
      }
      baseUpdate.etapa = e;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // ¿Hay ajuste de cantidad?
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
            fecha: fecha_ajuste ? new Date(fecha_ajuste) : new Date(),
            motivo: (motivo_ajuste && String(motivo_ajuste).trim()) || 'Ajuste manual',
            ref_tipo: 'AJUSTE_PT',
            ref_id: lote.id,
          },
        });
      } else if (Object.keys(baseUpdate).length) {
        // solo metadatos (código/fechas/etapa)
        await tx.lotes_producto_terminado.update({ where: { id }, data: baseUpdate });
      }

      // Recalcular stock vendible si el lote está (o queda) en etapa vendible
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

/* --- TOGGLE ESTADO (acepta toggle vacío o set explícito) --- */
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
      // toggle simple con body {}
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

    // bloquear si tiene SALIDAS
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
    if (e.code === 'P2003') {
      return res
        .status(409)
        .json({ message: 'No se puede eliminar: el lote tiene movimientos asociados' });
    }
    res.status(400).json({ message: e.message });
  }
};

/* --- LISTAR MOVIMIENTOS PT (enriquecidos + filtros) --- */
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
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
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

    const [prods, lotes] = await Promise.all([
      prodIds.length
        ? prisma.productos_terminados.findMany({
            where: { id: { in: prodIds } },
            select: { id: true, nombre: true },
          })
        : Promise.resolve([]),
      loteIds.length
        ? prisma.lotes_producto_terminado.findMany({
            where: { id: { in: loteIds } },
            select: { id: true, codigo: true },
          })
        : Promise.resolve([]),
    ]);

    const prodMap = new Map(prods.map((p) => [p.id, p.nombre]));
    const loteMap = new Map(lotes.map((l) => [l.id, l.codigo]));

    const term = (q || '').trim().toLowerCase();
    const items = rows
      .map((m) => ({
        id: m.id,
        fecha: m.fecha,
        producto_id: m.producto_id,
        producto_nombre: prodMap.get(m.producto_id) || null,
        lote_id: m.lote_id,
        lote_codigo: m.lote_id ? loteMap.get(m.lote_id) || null : null,
        tipo: m.tipo,
        cantidad: m.cantidad,
        motivo: m.motivo || null,
        ref_tipo: m.ref_tipo || null,
        ref_id: m.ref_id || null,
      }))
      .filter((m) => {
        if (!term) return true;
        return (
          (m.producto_nombre || '').toLowerCase().includes(term) ||
          (m.lote_codigo || '').toLowerCase().includes(term) ||
          (m.motivo || '').toLowerCase().includes(term)
        );
      });

    res.json({ total, items });
  } catch (e) {
    console.error('[listarMovimientosPT]', e);
    res.status(500).json({ message: e?.message || 'Error listando movimientos PT' });
  }
};
