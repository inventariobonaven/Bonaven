// src/controllers/pt.controller.js
const prisma = require('../database/prismaClient');

/* === helpers decimal milésimas === */
const toM = (v) => Math.round(Number(v) * 1000);
const fromM = (m) => (m / 1000).toFixed(3);
const addM = (a, b) => a + b;
const subM = (a, b) => a - b;

/* === helper fecha/hora === */
function toDateOrNow(input) {
  if (input === undefined || input === null) return new Date(); // ahora mismo

  const s = String(input).trim();

  // "HH:mm" => hoy con esa hora local
  if (/^\d{2}:\d{2}$/.test(s)) {
    const [hh, mm] = s.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  // "YYYY-MM-DD" => local a medianoche
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  // ISO u otros parseables
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
    _sum: { cantidad: true }
  });
  await tx.productos_terminados.update({
    where: { id: productoId },
    data: { stock_total: sum._sum.cantidad ?? 0 }
  });
};

const recalcStockMP = async (tx, mpId) => {
  const sum = await tx.lotes_materia_prima.aggregate({
    where: { materia_prima_id: mpId, estado: { in: ['DISPONIBLE', 'RESERVADO'] } },
    _sum: { cantidad: true }
  });
  await tx.materias_primas.update({
    where: { id: mpId },
    data: { stock_total: sum._sum.cantidad ?? 0 }
  });
};

/* ==== FIFO de empaques ==== */
const consumirEmpaqueFIFO = async (tx, empaqueId, cantidadNecesariaStr, meta = {}) => {
  let restanteM = toM(cantidadNecesariaStr);
  const lotes = await tx.lotes_materia_prima.findMany({
    where: { materia_prima_id: empaqueId, estado: 'DISPONIBLE' },
    orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }]
  });

  for (const lote of lotes) {
    if (restanteM <= 0) break;
    const dispM = toM(lote.cantidad);
    const usarM = Math.min(dispM, restanteM);
    if (usarM > 0) {
      const nuevaM = subM(dispM, usarM);
      await tx.lotes_materia_prima.update({
        where: { id: lote.id },
        data: { cantidad: fromM(nuevaM), estado: nuevaM === 0 ? 'AGOTADO' : 'DISPONIBLE' }
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
        }
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
  const uxe = Number(unidades_por_empaque || 0);   // unidades por empaque/paquete
  const bpu = Number(bolsas_por_unidad || 0);      // bolsas por paquete (si lo usas como “por empaque”)

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
    select: { ref_id: true }
  });
  if (mov?.ref_id) {
    const prod = await tx.producciones.findUnique({ where: { id: mov.ref_id }, select: { receta_id: true } });
    if (prod?.receta_id) {
      const map = await tx.receta_producto_map.findFirst({
        where: { receta_id: prod.receta_id, producto_id: productoId, vencimiento_base: base },
        select: { vida_util_dias: true }
      });
      if (map) return { vida_util_dias: map.vida_util_dias, origen: 'receta' };
    }
  }
  const maps = await tx.receta_producto_map.findMany({
    where: { producto_id: productoId, vencimiento_base: base },
    select: { vida_util_dias: true }
  });
  if (maps.length) {
    const vida = Math.max(...maps.map(m => Number(m.vida_util_dias || 0)));
    return { vida_util_dias: vida, origen: 'producto' };
  }
  return null;
}

/* ===================== CONTROLADORES ===================== */

/* --- ENTRADAS de PT (manuales) --- */
exports.ingresarPT = async (req, res) => {
  // compat: acepta { codigo } o { lote_codigo }
  const { producto_id, cantidad, codigo, lote_codigo, fecha_ingreso, fecha_vencimiento } = req.body;
  const code = (lote_codigo || codigo || '').trim();

  if (!producto_id || !cantidad || !code || !fecha_ingreso) {
    return res.status(400).json({ message: 'datos incompletos' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const prod = await tx.productos_terminados.findUnique({ where: { id: Number(producto_id) } });
      if (!prod || prod.estado === false) throw new Error('Producto no encontrado o inactivo');

      // Consumir bolsas: tratamos ingreso manual como EMPAQUE (vendible)
      if (prod.empaque_mp_id) {
        const bolsasNecesarias = calcularBolsasNecesarias(
          Number(cantidad),
          prod.bolsas_por_unidad,
          prod.unidades_por_empaque
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

      // Upsert lote (producto + código)
      let lote = await tx.lotes_producto_terminado.findFirst({
        where: { producto_id: Number(producto_id), codigo: code }
      });
      if (!lote) {
        lote = await tx.lotes_producto_terminado.create({
          data: {
            producto_id: Number(producto_id),
            codigo: code,
            cantidad: "0.000",
            fecha_ingreso: new Date(fecha_ingreso),
            fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
            estado: 'DISPONIBLE',
            etapa: 'EMPAQUE',
          }
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
          ref_tipo: 'PT_INGRESO'
        }
      });

      // Sumar al lote
      const nuevaM = addM(toM(lote.cantidad), toM(cantidad));
      lote = await tx.lotes_producto_terminado.update({
        where: { id: lote.id },
        data: { cantidad: fromM(nuevaM), estado: 'DISPONIBLE', etapa: 'EMPAQUE' }
      });

      await recalcStockPTReady(tx, Number(producto_id));
      return { lote_id: lote.id, producto_id: Number(producto_id) };
    });

    res.json(out);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Código de lote de PT duplicado' });
    res.status(400).json({ message: e.message });
  }
};

/* --- SALIDAS PT (FIFO o por LOTE), soporta paquetes y etapa preferida --- */
exports.salidaPT = async (req, res) => {
  try {
    let {
      producto_id,
      lote_id,
      loteId,                 // alias opcional desde el front
      cantidad,
      paquetes,
      etapa_preferida,        // "EMPAQUE" | "HORNEO" (opcional, sólo para FIFO)
      motivo = 'SALIDA_PT',
      fecha,
    } = req.body;

    const when = fecha ? new Date(fecha) : new Date();
    const loteIdNorm = Number(lote_id ?? loteId ?? 0) || null;

    const out = await prisma.$transaction(async (tx) => {
      /* ---------- SALIDA POR LOTE (manual) ---------- */
      if (loteIdNorm) {
        // Traemos lote y, si hace falta, calculamos cantidad a partir de "paquetes"
        const lote = await tx.lotes_producto_terminado.findUnique({
          where: { id: loteIdNorm },
          include: {
            productos_terminados: { select: { id: true, nombre: true, unidades_por_empaque: true } },
          },
        });
        if (!lote) throw new Error('Lote no encontrado');
        if (!VENTAS_ETAPAS.includes(String(lote.etapa))) throw new Error('El lote no está en etapa vendible');
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

      // Si no hay cantidad y viene "paquetes", calcular con unidades_por_empaque del producto
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
        orderBy: [
          { fecha_vencimiento: 'asc' },
          { fecha_ingreso: 'asc' },
          { id: 'asc' },
        ],
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
      return { ok: true, modo: 'FIFO', producto_id: Number(producto_id), etapa_preferida: (pref || null) };
    });

    res.json(out);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/** LISTAR LOTES (con filtros: etapa, producto_id, estado, q)
*  - Por defecto: sólo DISPONIBLE/RESERVADO
*  - Si etapa=CONGELADO y no piden include_empty=true, oculta cantidad=0
*/
exports.listarLotesPT = async (req, res) => {
  try {
    const { producto_id, etapa, estado, q, include_empty } = req.query;

    const where = {};
    if (producto_id) where.producto_id = Number(producto_id);

    const etapaNorm = etapa ? String(etapa).toUpperCase() : null;
    if (etapaNorm && ETAPAS.has(etapaNorm)) where.etapa = etapaNorm;

    // Por defecto, no mostramos INACTIVO/AGOTADO
    if (estado) {
      where.estado = String(estado).toUpperCase();
    } else {
      where.estado = { in: ['DISPONIBLE', 'RESERVADO'] };
    }

    // Para la vista de CONGELADO: ocultar vacíos salvo que pidan lo contrario
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
      include: { productos_terminados: { select: { id: true, nombre: true } } }
    });

    res.json(lotes);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/* --- MOVER ETAPA (CONGELADO -> EMPAQUE | HORNEO) --- */
exports.moverEtapa = async (req, res) => {
  const id = Number(req.params.id || req.body.lote_id); // compat con payload {lote_id}
  const { nueva_etapa, cantidad, fecha } = req.body;

  const dest = String(nueva_etapa || '').toUpperCase();
  if (!ETAPAS.has(dest)) return res.status(400).json({ message: 'nueva_etapa inválida' });
  const qty = Number(cantidad || 0);
  if (!(qty > 0)) return res.status(400).json({ message: 'cantidad debe ser > 0' });

  try {
    const out = await prisma.$transaction(async (tx) => {
      const src = await tx.lotes_producto_terminado.findUnique({
        where: { id },
        include: {
          productos_terminados: {
            select: {
              id: true, nombre: true,
              empaque_mp_id: true, bolsas_por_unidad: true, unidades_por_empaque: true,
              requiere_congelacion_previa: true,
            }
          }
        }
      });
      if (!src) throw new Error('Lote origen no encontrado');

      if (src.estado !== 'DISPONIBLE' || Number(src.cantidad) <= 0) {
        throw new Error('El lote origen no está disponible');
      }
      const srcEtapa = String(src.etapa || 'EMPAQUE').toUpperCase();
      if (srcEtapa !== 'CONGELADO') throw new Error('Solo se permite mover desde CONGELADO');
      if (!['EMPAQUE', 'HORNEO'].includes(dest)) throw new Error('Transición inválida: debe ser a EMPAQUE u HORNEO');
      if (qty > Number(src.cantidad)) throw new Error('Cantidad a mover mayor al disponible del lote');

      const fechaMov = toDateOrNow(fecha);

      // Lote destino: mismo producto, codigo derivado
      const suf = dest === 'EMPAQUE' ? 'E' : 'H';
      const codigoDestino = `${src.codigo}-${suf}`;

      let dst = await tx.lotes_producto_terminado.findFirst({
        where: { producto_id: src.producto_id, codigo: codigoDestino }
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
          }
        });
      } else if (dst.etapa !== dest) {
        await tx.lotes_producto_terminado.update({
          where: { id: dst.id },
          data: { etapa: dest }
        });
      }

      // SALIDA del origen
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
        }
      });
      await tx.lotes_producto_terminado.update({
        where: { id: src.id },
        data: { cantidad: fromM(nuevaSrcM), estado: nuevaSrcM === 0 ? 'AGOTADO' : 'DISPONIBLE' }
      });

      // ENTRADA al destino
      const nuevaDstM = addM(toM(dst.cantidad), moverM);

      // Descontar bolsas si destino = EMPAQUE
      let bolsasConsumidas = 0;
      if (dest === 'EMPAQUE' && src.productos_terminados?.empaque_mp_id) {
        bolsasConsumidas = calcularBolsasNecesarias(
          qty,
          src.productos_terminados.bolsas_por_unidad,
          src.productos_terminados.unidades_por_empaque
        );
        if (bolsasConsumidas > 0) {
          await consumirEmpaqueFIFO(
            tx,
            src.productos_terminados.empaque_mp_id,
            String(bolsasConsumidas),
            { motivo: `Empaque por cambio de etapa a EMPAQUE (lote ${codigoDestino})`, ref_tipo: 'CAMBIO_ETAPA', ref_id: dst.id, fecha: fechaMov }
          );
          await recalcStockMP(tx, src.productos_terminados.empaque_mp_id);
        }
      }

      // FECHA DE VENCIMIENTO: heredar del origen (regla global)
      const dstVto = dst.fecha_vencimiento || src.fecha_vencimiento || null;

      await tx.lotes_producto_terminado.update({
        where: { id: dst.id },
        data: {
          cantidad: fromM(nuevaDstM),
          etapa: dest,
          fecha_ingreso: dst.fecha_ingreso || fechaMov,
          estado: 'DISPONIBLE',
          ...(dstVto ? { fecha_vencimiento: dstVto } : {}),
        }
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
        }
      });

      await recalcStockPTReady(tx, src.producto_id);

      return {
        origen: { id: src.id, codigo: src.codigo, etapa: srcEtapa, cantidad_antes: src.cantidad, cantidad_despues: fromM(nuevaSrcM) },
        destino: { id: dst.id, codigo: codigoDestino, etapa: dest, agregado: String(qty), fecha_vencimiento: dstVto || null },
        empaques_consumidos: bolsasConsumidas || 0,
        vencimiento_fuente: dst.fecha_vencimiento ? 'destino_existente' : (src.fecha_vencimiento ? 'copiado_origen' : null),
      };
    });

    res.json({ message: 'Etapa actualizada', ...out });
  } catch (e) {
    console.error('[pt.moverEtapa]', e);
    res.status(400).json({ message: e.message });
  }
};

/* --- ACTUALIZAR LOTE (codigo/fechas) --- */
exports.actualizarLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { codigo, fecha_ingreso, fecha_vencimiento } = req.body;

    const lote = await prisma.lotes_producto_terminado.update({
      where: { id },
      data: {
        ...(codigo ? { codigo: String(codigo).trim() } : {}),
        ...(fecha_ingreso ? { fecha_ingreso: new Date(fecha_ingreso) } : {}),
        ...(fecha_vencimiento ? { fecha_vencimiento: new Date(fecha_vencimiento) } : { fecha_vencimiento: null }),
      },
      select: { id: true, producto_id: true, etapa: true }
    });

    // si es vendible, recalcular stock_total (no cambia cantidad, pero por seguridad)
    if (VENTAS_ETAPAS.includes(String(lote.etapa))) {
      await recalcStockPTReady(prisma, lote.producto_id);
    }

    res.json({ ok: true, id: lote.id });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Código de lote ya usado para ese producto' });
    res.status(400).json({ message: e.message });
  }
};

/* --- TOGGLE ESTADO (activo/inactivo) --- */
exports.toggleEstadoLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body; // true -> DISPONIBLE/AGOTADO ; false -> INACTIVO
    const lote = await prisma.lotes_producto_terminado.findUnique({
      where: { id },
      select: { id: true, producto_id: true, cantidad: true, etapa: true }
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });

    let nuevoEstado = 'INACTIVO';
    if (activo === true) {
      nuevoEstado = Number(lote.cantidad) > 0 ? 'DISPONIBLE' : 'AGOTADO';
    }

    const upd = await prisma.lotes_producto_terminado.update({
      where: { id },
      data: { estado: nuevoEstado },
      select: { id: true, estado: true, producto_id: true, etapa: true }
    });

    if (VENTAS_ETAPAS.includes(String(upd.etapa))) {
      await recalcStockPTReady(prisma, upd.producto_id);
    }

    res.json({ id: upd.id, estado: upd.estado });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* --- ELIMINAR LOTE --- */
exports.eliminarLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Se intentará borrar; si tiene FKs (movimientos, etc.) P2003
    const lote = await prisma.lotes_producto_terminado.delete({
      where: { id },
      select: { producto_id: true, etapa: true }
    });
    if (VENTAS_ETAPAS.includes(String(lote.etapa))) {
      await recalcStockPTReady(prisma, lote.producto_id);
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2003') {
      return res.status(409).json({ message: 'No se puede eliminar: el lote tiene movimientos asociados' });
    }
    res.status(400).json({ message: e.message });
  }
};

/* --- LISTAR MOVIMIENTOS PT (enriquecidos + filtros) --- */
exports.listarMovimientosPT = async (req, res) => {
  try {
    const { q, producto_id, tipo, desde, hasta, pageSize = '300' } = req.query;

    // Filtros básicos
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

    // Sin include: traemos solo campos primarios
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

    // Lookups por IDs para nombres/códigos
    const prodIds = Array.from(new Set(rows.map(r => r.producto_id).filter(Boolean)));
    const loteIds = Array.from(new Set(rows.map(r => r.lote_id).filter(Boolean)));

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

    const prodMap = new Map(prods.map(p => [p.id, p.nombre]));
    const loteMap = new Map(lotes.map(l => [l.id, l.codigo]));

    // Enriquecer + filtro q
    const term = (q || '').trim().toLowerCase();
    const items = rows
      .map(m => ({
        id: m.id,
        fecha: m.fecha,
        producto_id: m.producto_id,
        producto_nombre: prodMap.get(m.producto_id) || null,
        lote_id: m.lote_id,
        lote_codigo: m.lote_id ? (loteMap.get(m.lote_id) || null) : null,
        tipo: m.tipo,
        cantidad: m.cantidad,
        motivo: m.motivo || null,
        ref_tipo: m.ref_tipo || null,
        ref_id: m.ref_id || null,
      }))
      .filter(m => {
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