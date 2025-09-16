const prisma = require('../database/prismaClient');
const { descontarFIFO } = require('../services/fifo.services');

/* ================= Helpers base ================= */
function toDate(x) {
  if (!x && x !== 0) return null;
  const d = new Date(String(x));
  return isNaN(d) ? null : d;
}
function decToNumber(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === 'object' && typeof v.toString === 'function') {
    const n = Number(v.toString());
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function decToString(v, fallback = '0') {
  if (v == null) return fallback;
  if (typeof v === 'object' && typeof v.toString === 'function') return v.toString();
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : fallback;
}

/* ================= Constantes negocio ================= */
const ESTADOS_LOTE_PT = new Set(['DISPONIBLE', 'RESERVADO', 'AGOTADO', 'VENCIDO', 'INACTIVO']);
const MOV_PT = { ENTRADA: 'ENTRADA', SALIDA: 'SALIDA', AJUSTE: 'AJUSTE' };
const ETAPAS = new Set(['CONGELADO', 'EMPAQUE', 'HORNEO']);
const ETAPAS_VENDIBLES = new Set(['EMPAQUE', 'HORNEO']);

/* ================= Helpers negocio ================= */
async function recalcStockPTReady(tx, productoId) {
  const agg = await tx.lotes_producto_terminado.aggregate({
    where: {
      producto_id: Number(productoId),
      estado: { in: ['DISPONIBLE', 'RESERVADO'] },
      etapa: { in: Array.from(ETAPAS_VENDIBLES) },
    },
    _sum: { cantidad: true },
  });
  await tx.productos_terminados.update({
    where: { id: Number(productoId) },
    data: { stock_total: agg._sum.cantidad ?? 0 },
  });
}

function calcularBolsasNecesarias(producto, unidades) {
  const bolsasPorUnidad = decToNumber(producto.bolsas_por_unidad, 0);
  const unidadesPorEmpaque = decToNumber(producto.unidades_por_empaque, 0);
  if (bolsasPorUnidad > 0) return Math.ceil(unidades * bolsasPorUnidad);
  if (unidadesPorEmpaque > 0) return Math.ceil(unidades / unidadesPorEmpaque);
  return 0;
}

async function obtenerVidaUtilPorEtapaBase(productoId, etapaBase) {
  const maps = await prisma.receta_producto_map.findMany({
    where: { producto_id: Number(productoId), vencimiento_base: etapaBase },
    select: { vida_util_dias: true },
    orderBy: { vida_util_dias: 'desc' },
    take: 1,
  });
  if (!maps || maps.length === 0) return null;
  const dias = Number(maps[0].vida_util_dias || 0);
  return Number.isFinite(dias) && dias > 0 ? dias : null;
}

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

/* =========================================================
GET /api/stock-pt/lotes
========================================================= */
async function listarLotes(req, res) {
  try {
    const { producto_id, q, estado, etapa } = req.query;
    const where = {};

    if (producto_id) where.producto_id = Number(producto_id);
    if (estado && ESTADOS_LOTE_PT.has(String(estado).toUpperCase())) {
      where.estado = String(estado).toUpperCase();
    }
    if (etapa && ETAPAS.has(String(etapa).toUpperCase())) {
      where.etapa = String(etapa).toUpperCase();
    }
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { codigo: { contains: term, mode: 'insensitive' } },
        { productos_terminados: { is: { nombre: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const rows = await prisma.lotes_producto_terminado.findMany({
      where,
      orderBy: [{ fecha_ingreso: 'desc' }, { id: 'desc' }],
      take: 300,
      include: {
        productos_terminados: {
          select: { id: true, nombre: true, unidades_por_empaque: true },
        },
      },
    });

    const data = rows.map((l) => {
      const etapaRow = String(l.etapa || '').toUpperCase();
      const uds = decToNumber(l.cantidad, 0);
      const uxe = decToNumber(l.productos_terminados?.unidades_por_empaque, 0);

      let paquetes = null;
      let residuo_unidades = null;
      if (etapaRow === 'EMPAQUE' && uxe > 0) {
        paquetes = Math.floor(uds / uxe);
        residuo_unidades = uds - paquetes * uxe;
      }

      return {
        ...l,
        cantidad: decToString(l.cantidad, '0'),
        productos_terminados: { ...l.productos_terminados, unidades_por_empaque: uxe },
        paquetes,
        residuo_unidades,
      };
    });

    res.json(data);
  } catch (e) {
    console.error('[stockPT.listarLotes]', e);
    res.status(500).json({ message: 'Error listando lotes de PT' });
  }
}

/* =========================================================
POST /api/stock-pt/ingreso
========================================================= */
async function ingresoLote(req, res) {
  try {
    const { producto_id, codigo, cantidad, fecha_ingreso, fecha_vencimiento } = req.body;

    if (!producto_id || !codigo || !cantidad) {
      return res.status(400).json({ message: 'producto_id, codigo y cantidad son obligatorios' });
    }
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: 'cantidad debe ser > 0' });
    }

    const prod = await prisma.productos_terminados.findUnique({
      where: { id: Number(producto_id) },
      select: {
        id: true,
        nombre: true,
        empaque_mp_id: true,
        bolsas_por_unidad: true,
        unidades_por_empaque: true,
      },
    });
    if (!prod) return res.status(404).json({ message: 'Producto terminado no encontrado' });

    assertMultipleIfEmpaque(prod, qty);

    const fIng = toDate(fecha_ingreso) || new Date();
    const fVen = toDate(fecha_vencimiento) || null;

    const loteCreado = await prisma.$transaction(async (tx) => {
      const lote = await tx.lotes_producto_terminado.create({
        data: {
          producto_id: Number(producto_id),
          codigo: String(codigo).trim(),
          cantidad: qty,
          fecha_ingreso: fIng,
          fecha_vencimiento: fVen,
          estado: 'DISPONIBLE',
          etapa: 'EMPAQUE',
        },
      });

      await tx.stock_producto_terminado.create({
        data: {
          producto_id: Number(producto_id),
          lote_id: lote.id,
          tipo: MOV_PT.ENTRADA,
          cantidad: qty,
          fecha: fIng,
          motivo: 'Ingreso manual de lote',
          ref_tipo: 'INGRESO_PT',
          ref_id: lote.id,
        },
      });

      const empaqueId = Number(prod.empaque_mp_id || 0);
      const bolsasNecesarias = empaqueId > 0 ? calcularBolsasNecesarias(prod, qty) : 0;
      if (empaqueId > 0 && bolsasNecesarias > 0) {
        await descontarFIFO(tx, empaqueId, bolsasNecesarias, {
          motivo: `Empaque ingreso lote PT #${lote.id} (${prod.nombre})`,
          ref_tipo: 'INGRESO_PT',
          ref_id: lote.id,
          fecha: fIng,
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

      await recalcStockPTReady(tx, Number(producto_id));
      return lote;
    });

    res.status(201).json({ message: 'Lote de PT registrado', lote: loteCreado });
  } catch (e) {
    console.error('[stockPT.ingresoLote]', e);
    res.status(500).json({ message: e?.message || 'Error registrando lote de PT' });
  }
}

/* =========================================================
POST /api/stock-pt/salida
========================================================= */
async function registrarSalida(req, res) {
  try {
    const { producto_id, lote_id, cantidad, fecha, motivo } = req.body;

    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: 'cantidad debe ser > 0' });
    }
    const f = toDate(fecha) || new Date();
    const motivoTxt = (motivo && String(motivo).trim()) || null;

    if (lote_id) {
      const lote = await prisma.lotes_producto_terminado.findUnique({
        where: { id: Number(lote_id) },
      });
      if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });
      if (!ETAPAS_VENDIBLES.has(lote.etapa)) {
        return res.status(400).json({ message: 'El lote no está en una etapa vendible' });
      }
      if (lote.estado !== 'DISPONIBLE' || decToNumber(lote.cantidad) <= 0) {
        return res.status(400).json({ message: 'El lote no está disponible' });
      }
      if (qty > decToNumber(lote.cantidad)) {
        return res.status(400).json({ message: 'Stock insuficiente en el lote' });
      }

      await prisma.$transaction(async (tx) => {
        const nuevo = decToNumber(lote.cantidad) - qty;

        await tx.lotes_producto_terminado.update({
          where: { id: lote.id },
          data: { cantidad: nuevo, estado: nuevo <= 0 ? 'AGOTADO' : 'DISPONIBLE' },
        });

        await tx.stock_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            lote_id: lote.id,
            tipo: MOV_PT.SALIDA,
            cantidad: qty,
            fecha: f,
            motivo: motivoTxt || 'Salida por lote',
            ref_tipo: 'SALIDA_PT',
            ref_id: lote.id,
          },
        });

        await recalcStockPTReady(tx, lote.producto_id);
      });

      return res.json({
        message: 'Salida registrada',
        detalle: [{ lote_id: Number(lote_id), usado: qty }],
      });
    }

    const prodId = Number(producto_id);
    if (!prodId) {
      return res.status(400).json({ message: 'Debe enviar producto_id (para FIFO) o lote_id' });
    }

    const lotes = await prisma.lotes_producto_terminado.findMany({
      where: {
        producto_id: prodId,
        estado: 'DISPONIBLE',
        etapa: { in: Array.from(ETAPAS_VENDIBLES) },
        cantidad: { gt: 0 },
      },
      orderBy: [{ fecha_ingreso: 'asc' }, { id: 'asc' }],
      take: 500,
    });

    let restante = qty;
    const consumo = [];
    for (const l of lotes) {
      if (restante <= 0) break;
      const disponible = decToNumber(l.cantidad, 0);
      if (disponible <= 0) continue;
      const usar = Math.min(restante, disponible);
      consumo.push({ lote: l, usar });
      restante -= usar;
    }

    if (restante > 0) {
      return res.status(400).json({ message: 'Stock insuficiente', faltante: restante });
    }

    await prisma.$transaction(async (tx) => {
      for (const { lote: l, usar } of consumo) {
        const nuevo = decToNumber(l.cantidad) - usar;

        await tx.lotes_producto_terminado.update({
          where: { id: l.id },
          data: { cantidad: nuevo, estado: nuevo <= 0 ? 'AGOTADO' : 'DISPONIBLE' },
        });

        await tx.stock_producto_terminado.create({
          data: {
            producto_id: prodId,
            lote_id: l.id,
            tipo: MOV_PT.SALIDA,
            cantidad: usar,
            fecha: f,
            motivo: motivoTxt || 'Salida FIFO',
            ref_tipo: 'SALIDA_PT',
            ref_id: l.id,
          },
        });
      }

      await recalcStockPTReady(tx, prodId);
    });

    const plan = consumo.map((x) => ({ lote_id: x.lote.id, codigo: x.lote.codigo, usado: x.usar }));
    res.json({ message: 'Salida registrada', plan });
  } catch (e) {
    console.error('[stockPT.registrarSalida]', e);
    res.status(500).json({ message: e?.message || 'Error registrando salida de PT' });
  }
}

/* =========================================================
GET /api/stock-pt/movimientos
========================================================= */
async function listarMovimientos(req, res) {
  try {
    const { producto_id, lote_id, tipo, q, desde, hasta, page = '1', pageSize = '100' } = req.query;

    const where = {};
    if (producto_id) where.producto_id = Number(producto_id);
    if (lote_id) where.lote_id = Number(lote_id);
    if (
      tipo &&
      [MOV_PT.ENTRADA, MOV_PT.SALIDA, MOV_PT.AJUSTE].includes(String(tipo).toUpperCase())
    ) {
      where.tipo = String(tipo).toUpperCase();
    }
    if (q && q.trim()) where.motivo = { contains: q.trim(), mode: 'insensitive' };
    if (desde || hasta) where.fecha = {};
    if (desde) where.fecha.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.fecha.lte = new Date(`${hasta}T23:59:59`);

    const take = Math.max(1, Math.min(Number(pageSize) || 100, 500));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [total, rows] = await Promise.all([
      prisma.stock_producto_terminado.count({ where }),
      prisma.stock_producto_terminado.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    const prodIds = [...new Set(rows.map((r) => r.producto_id).filter(Boolean))];
    const loteIds = [...new Set(rows.map((r) => r.lote_id).filter(Boolean))];

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

    const prodMap = new Map(prods.map((p) => [p.id, p]));
    const loteMap = new Map(lotes.map((l) => [l.id, l]));

    const items = rows.map((m) => ({
      id: m.id,
      producto_id: m.producto_id,
      producto_nombre: prodMap.get(m.producto_id)?.nombre ?? null,
      lote_id: m.lote_id,
      lote_codigo: loteMap.get(m.lote_id)?.codigo ?? null,
      tipo: m.tipo,
      cantidad: decToString(m.cantidad, '0'),
      fecha: m.fecha,
      motivo: m.motivo || null,
      ref_tipo: m.ref_tipo || null,
      ref_id: m.ref_id || null,
    }));

    res.json({ total, page: Number(page) || 1, pageSize: take, items });
  } catch (e) {
    console.error('[stockPT.listarMovimientos]', e);
    res.status(500).json({ message: 'Error listando movimientos de PT' });
  }
}

/* =========================================================
PATCH /api/stock-pt/lotes/:id/etapa
========================================================= */
async function moverEtapaLote(req, res) {
  try {
    const id = Number(req.params.id);
    const { nueva_etapa, cantidad, fecha_evento, recalcular_vencimiento } = req.body;

    const etapa = String(nueva_etapa || '').toUpperCase();
    if (!ETAPAS.has(etapa)) return res.status(400).json({ message: 'nueva_etapa inválida' });

    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      include: { productos_terminados: true },
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    const cantMov = cantidad !== undefined ? Number(cantidad) : undefined;
    if (cantMov !== undefined && (!Number.isFinite(cantMov) || cantMov <= 0)) {
      return res.status(400).json({ message: 'cantidad inválida' });
    }
    if (cantMov !== undefined && cantMov > decToNumber(lote.cantidad)) {
      return res.status(400).json({ message: 'La cantidad a mover excede el disponible del lote' });
    }
    if (lote.etapa === etapa && (cantMov === undefined || cantMov === decToNumber(lote.cantidad))) {
      return res.status(400).json({ message: 'El lote ya está en la etapa solicitada' });
    }

    const fechaBase = toDate(fecha_evento) || new Date();

    const result = await prisma.$transaction(async (tx) => {
      const producto = await tx.productos_terminados.findUnique({
        where: { id: lote.producto_id },
        select: {
          id: true,
          nombre: true,
          empaque_mp_id: true,
          bolsas_por_unidad: true,
          unidades_por_empaque: true,
        },
      });
      if (!producto) throw new Error('Producto no encontrado para el lote');

      if (etapa === 'EMPAQUE') {
        const qty = cantMov !== undefined ? Number(cantMov) : decToNumber(lote.cantidad);
        assertMultipleIfEmpaque(producto, qty);
      }

      let createdDestino = null;
      let updatedOrigen = null;

      let nuevaFechaVto = null;
      if (etapa === 'EMPAQUE' || etapa === 'HORNEO') {
        const vida = await obtenerVidaUtilPorEtapaBase(lote.producto_id, etapa);
        if (vida && (recalcular_vencimiento || !lote.fecha_vencimiento)) {
          const d = new Date(fechaBase);
          d.setDate(d.getDate() + vida);
          nuevaFechaVto = d;
        }
      }

      if (cantMov !== undefined && cantMov < decToNumber(lote.cantidad)) {
        updatedOrigen = await tx.lotes_producto_terminado.update({
          where: { id: lote.id },
          data: {
            cantidad: decToNumber(lote.cantidad) - cantMov,
            estado: decToNumber(lote.cantidad) - cantMov <= 0 ? 'AGOTADO' : lote.estado,
          },
        });

        const codigoDestino = `${lote.codigo}-${etapa.substring(0, 1)}${Date.now() % 10000}`;
        createdDestino = await tx.lotes_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            codigo: codigoDestino,
            cantidad: cantMov,
            fecha_ingreso: fechaBase,
            fecha_vencimiento: nuevaFechaVto ?? lote.fecha_vencimiento ?? null,
            estado: 'DISPONIBLE',
            etapa,
          },
        });

        await tx.stock_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            lote_id: lote.id,
            tipo: MOV_PT.AJUSTE,
            cantidad: cantMov,
            fecha: fechaBase,
            motivo: `Cambio de etapa: ${lote.etapa} → ${etapa} (traslado parcial)`,
            ref_tipo: 'CAMBIO_ETAPA',
            ref_id: createdDestino.id,
          },
        });
        await tx.stock_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            lote_id: createdDestino.id,
            tipo: MOV_PT.AJUSTE,
            cantidad: cantMov,
            fecha: fechaBase,
            motivo: `Cambio de etapa: ${lote.etapa} → ${etapa} (ingreso parcial)`,
            ref_tipo: 'CAMBIO_ETAPA',
            ref_id: lote.id,
          },
        });

        if (etapa === 'EMPAQUE') {
          const empaqueId = Number(producto.empaque_mp_id || 0);
          const bolsasNecesarias = empaqueId > 0 ? calcularBolsasNecesarias(producto, cantMov) : 0;
          if (empaqueId > 0 && bolsasNecesarias > 0) {
            await descontarFIFO(tx, empaqueId, bolsasNecesarias, {
              motivo: `Empaque por cambio de etapa lote #${createdDestino.id} (${producto.nombre})`,
              ref_tipo: 'CAMBIO_ETAPA',
              ref_id: createdDestino.id,
              fecha: fechaBase,
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
      } else {
        createdDestino = await tx.lotes_producto_terminado.update({
          where: { id: lote.id },
          data: {
            etapa,
            fecha_ingreso: fechaBase,
            ...(nuevaFechaVto ? { fecha_vencimiento: nuevaFechaVto } : {}),
          },
        });

        await tx.stock_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            lote_id: lote.id,
            tipo: MOV_PT.AJUSTE,
            cantidad: decToNumber(lote.cantidad),
            fecha: fechaBase,
            motivo: `Cambio de etapa: ${lote.etapa} → ${etapa} (total)`,
            ref_tipo: 'CAMBIO_ETAPA',
            ref_id: lote.id,
          },
        });

        if (etapa === 'EMPAQUE') {
          const empaqueId = Number(producto.empaque_mp_id || 0);
          const unidades = decToNumber(lote.cantidad);
          const bolsasNecesarias = empaqueId > 0 ? calcularBolsasNecesarias(producto, unidades) : 0;
          if (empaqueId > 0 && bolsasNecesarias > 0) {
            await descontarFIFO(tx, empaqueId, bolsasNecesarias, {
              motivo: `Empaque por cambio de etapa lote #${lote.id} (${producto.nombre})`,
              ref_tipo: 'CAMBIO_ETAPA',
              ref_id: lote.id,
              fecha: fechaBase,
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

      await recalcStockPTReady(tx, lote.producto_id);
      return { origen: updatedOrigen || null, destino: createdDestino };
    });

    res.json({ message: 'Etapa actualizada', result });
  } catch (e) {
    console.error('[stockPT.moverEtapaLote]', e);
    res.status(500).json({ message: e?.message || 'Error cambiando etapa del lote' });
  }
}

// --- reemplaza SOLO esta función en tu controller ---
async function actualizarLote(req, res) {
  try {
    const id = Number(req.params.id);

    // DEBUG: ver exactamente qué llega
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PUT /stock-pt/lotes/:id] body=', JSON.stringify(req.body));
    }

    const {
      codigo,
      fecha_ingreso,
      fecha_vencimiento, // puede ser null para limpiar; "" se IGNORA
      cantidad, // absoluto
      cantidad_final,
      targetUd,
      cantidad_delta, // delta (+/-)
      deltaCantidad,
      cantidadDelta,
      motivo_ajuste,
      fecha_ajuste,
      paquetes,
      sueltas,
    } = req.body;

    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      include: { productos_terminados: { select: { unidades_por_empaque: true } } },
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    const actual = Math.max(0, Math.round(decToNumber(lote.cantidad)));
    const uxe = Math.max(
      0,
      Math.round(decToNumber(lote.productos_terminados?.unidades_por_empaque, 0)),
    );
    const toInt = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    };

    // ---- Resolver nueva cantidad ---------------------------------------
    let newCantidad = undefined;

    // paquetes/sueltas si hay tamaño de empaque
    if (uxe > 0 && (paquetes !== undefined || sueltas !== undefined)) {
      const pk = toInt(paquetes);
      const su = toInt(sueltas);
      newCantidad = pk * uxe + su;
    }

    // candidatos “absolutos”
    for (const cand of [cantidad, cantidad_final, targetUd]) {
      if (newCantidad === undefined && cand !== undefined) {
        const c = toInt(cand);
        if (!Number.isFinite(c) || c < 0) {
          return res.status(400).json({ message: 'cantidad inválida' });
        }
        newCantidad = c;
      }
    }

    // delta si no vino absoluto
    if (newCantidad === undefined) {
      const deltaRaw = cantidad_delta ?? deltaCantidad ?? cantidadDelta;
      if (deltaRaw !== undefined) {
        const d = Number(deltaRaw);
        if (!Number.isFinite(d)) {
          return res.status(400).json({ message: 'cantidad_delta inválida' });
        }
        newCantidad = Math.max(0, actual + Math.round(d));
      }
    }

    if (newCantidad !== undefined && (!Number.isFinite(newCantidad) || newCantidad < 0)) {
      return res.status(400).json({ message: 'cantidad inválida' });
    }

    // ---- Metadata (solo tocar si corresponde) --------------------------
    const baseUpdate = {};

    if (codigo !== undefined) {
      baseUpdate.codigo = String(codigo).trim();
    }

    if (fecha_ingreso !== undefined) {
      baseUpdate.fecha_ingreso = fecha_ingreso ? toDate(fecha_ingreso) : null;
    }

    // MUY IMPORTANTE: SOLO tocar fecha_vencimiento si:
    //  - viene null  -> limpiar
    //  - viene una fecha válida -> set
    //  - si viene "" o no viene -> NO tocar
    if (Object.prototype.hasOwnProperty.call(req.body, 'fecha_vencimiento')) {
      if (fecha_vencimiento === null) {
        baseUpdate.fecha_vencimiento = null;
      } else if (fecha_vencimiento) {
        const fv = toDate(fecha_vencimiento);
        if (!fv) return res.status(400).json({ message: 'fecha_vencimiento inválida' });
        baseUpdate.fecha_vencimiento = fv;
      } // "" => no tocar
    }

    // DEBUG: mostrar qué vamos a aplicar
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[PUT /stock-pt/lotes/:id] baseUpdate=',
        baseUpdate,
        'newCantidad=',
        newCantidad,
        'actual=',
        actual,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newCantidad !== undefined && newCantidad !== actual) {
        const delta = newCantidad - actual;
        const nuevoEstado =
          newCantidad <= 0 ? 'AGOTADO' : lote.estado === 'INACTIVO' ? 'INACTIVO' : 'DISPONIBLE';

        await tx.lotes_producto_terminado.update({
          where: { id },
          data: { ...baseUpdate, cantidad: newCantidad, estado: nuevoEstado },
        });

        await tx.stock_producto_terminado.create({
          data: {
            producto_id: lote.producto_id,
            lote_id: lote.id,
            tipo: MOV_PT.AJUSTE,
            cantidad: Math.abs(delta),
            fecha: toDate(fecha_ajuste) || new Date(),
            motivo: (motivo_ajuste && String(motivo_ajuste).trim()) || 'Ajuste manual',
            ref_tipo: 'AJUSTE_PT',
            ref_id: lote.id,
          },
        });
      } else if (Object.keys(baseUpdate).length) {
        await tx.lotes_producto_terminado.update({ where: { id }, data: baseUpdate });
      }

      await recalcStockPTReady(tx, lote.producto_id);

      return tx.lotes_producto_terminado.findUnique({
        where: { id },
        include: {
          productos_terminados: { select: { id: true, nombre: true, unidades_por_empaque: true } },
        },
      });
    });

    res.json({ message: 'Lote actualizado', lote: updated });
  } catch (e) {
    console.error('[stockPT.actualizarLote]', e, { body: req.body });
    res.status(500).json({ message: e?.message || 'Error actualizando lote de PT' });
  }
}

/* =========================================================
PATCH /api/stock-pt/lotes/:id/estado
========================================================= */
async function toggleEstadoLote(req, res) {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;

    const lote = await prisma.lotes_producto_terminado.findUnique({ where: { id } });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    let nuevoEstado;
    if (estado) {
      const up = String(estado).toUpperCase();
      if (!ESTADOS_LOTE_PT.has(up)) {
        return res.status(400).json({ message: 'estado inválido' });
      }
      nuevoEstado =
        up === 'DISPONIBLE' ? (decToNumber(lote.cantidad) > 0 ? 'DISPONIBLE' : 'AGOTADO') : up;
    } else {
      nuevoEstado =
        lote.estado === 'INACTIVO'
          ? decToNumber(lote.cantidad) > 0
            ? 'DISPONIBLE'
            : 'AGOTADO'
          : 'INACTIVO';
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.lotes_producto_terminado.update({ where: { id }, data: { estado: nuevoEstado } });
      await recalcStockPTReady(tx, lote.producto_id);

      return tx.lotes_producto_terminado.findUnique({
        where: { id },
        include: {
          productos_terminados: { select: { id: true, nombre: true, unidades_por_empaque: true } },
        },
      });
    });

    res.json({ message: 'Estado actualizado', lote: updated });
  } catch (e) {
    console.error('[stockPT.toggleEstadoLote]', e);
    res.status(500).json({ message: e?.message || 'Error actualizando estado del lote' });
  }
}

/* =========================================================
DELETE /api/stock-pt/lotes/:id
========================================================= */
async function eliminarLote(req, res) {
  try {
    const id = Number(req.params.id);
    const lote = await prisma.lotes_producto_terminado.findUnique({ where: { id } });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    const salidas = await prisma.stock_producto_terminado.count({
      where: { lote_id: id, tipo: MOV_PT.SALIDA },
    });
    if (salidas > 0) {
      return res
        .status(400)
        .json({ message: 'No se puede eliminar: el lote tiene salidas registradas' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.stock_producto_terminado.deleteMany({ where: { lote_id: id } });
      await tx.lotes_producto_terminado.delete({ where: { id } });
      await recalcStockPTReady(tx, lote.producto_id);
    });

    res.json({ message: 'Lote eliminado' });
  } catch (e) {
    console.error('[stockPT.eliminarLote]', e);
    res.status(500).json({ message: 'Error eliminando lote de PT' });
  }
}

/* ================= Exports ================= */
module.exports = {
  listarLotes,
  ingresoLote,
  registrarSalida,
  listarMovimientos,
  moverEtapaLote,
  actualizarLote,
  toggleEstadoLote,
  eliminarLote,
};
