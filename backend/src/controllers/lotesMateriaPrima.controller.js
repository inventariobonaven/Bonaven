const prisma = require('../database/prismaClient');
const { Prisma } = require('../generated/prisma');
const { coerceToMpBase } = require('../utils/units');


const ESTADOS_VALIDOS = ['DISPONIBLE', 'RESERVADO', 'AGOTADO', 'VENCIDO', 'INACTIVO'];


/** Utilidad: Decimal fijo a 3 decimales usando Prisma.Decimal */
function toDec(x) {
  if (x === null || x === undefined) return new Prisma.Decimal('0.000');
  if (x instanceof Prisma.Decimal) return x;
  if (typeof x === 'string') return new Prisma.Decimal(x);
  return new Prisma.Decimal(Number(x).toFixed(3));
}


function cleanCodigo(c) {
  if (c === null || c === undefined) return '';
  return String(c).trim();
}


/** Crear lote (ahora exige `codigo`) */
exports.crearLote = async (req, res) => {
  try {
    const {
      materia_prima_id,
      proveedor_id,
      codigo,                    // <-- NUEVO (requerido)
      cantidad,
      unidad,
      fecha_ingreso,
      fecha_vencimiento,
      estado
    } = req.body;


    if (!materia_prima_id || cantidad === undefined || !fecha_ingreso) {
      return res.status(400).json({ message: 'materia_prima_id, cantidad y fecha_ingreso son obligatorios' });
    }


    const codigoClean = cleanCodigo(codigo);
    if (!codigoClean) {
      return res.status(400).json({ message: 'El código/número de lote es obligatorio' });
    }


    const mp = await prisma.materias_primas.findUnique({ where: { id: Number(materia_prima_id) } });
    if (!mp) return res.status(404).json({ message: 'Materia prima no encontrada' });


    if (proveedor_id) {
      const prov = await prisma.proveedores.findUnique({ where: { id: Number(proveedor_id) } });
      if (!prov) return res.status(404).json({ message: 'Proveedor no encontrado' });
    }


    // ¿Existe ya ese código para esa MP?
    const dup = await prisma.lotes_materia_prima.findFirst({
      where: {
        materia_prima_id: Number(materia_prima_id),
        codigo: codigoClean
      },
      select: { id: true }
    });
    if (dup) {
      return res.status(409).json({ message: `Ya existe un lote con código "${codigoClean}" para esa materia prima` });
    }


    // Convertir cantidad recibida a la unidad base de la MP
    let qtyBaseNum;
    try {
      const { qtyBase } = coerceToMpBase(Number(cantidad), unidad, mp.unidad_medida);
      qtyBaseNum = qtyBase;
    } catch (e) {
      return res.status(400).json({ message: e.message || 'Unidad inválida/incompatible' });
    }


    const cantDec = toDec(qtyBaseNum);
    if (cantDec.lt(0)) {
      return res.status(400).json({ message: 'La cantidad del lote no puede ser negativa' });
    }


    const estadoFinal = ESTADOS_VALIDOS.includes(String(estado)) ? estado : 'DISPONIBLE';


    const nuevoLote = await prisma.$transaction(async (tx) => {
      // 1) Crear lote (cantidad ya en base de la MP)
      const lote = await tx.lotes_materia_prima.create({
        data: {
          materia_prima_id: Number(materia_prima_id),
          proveedor_id: proveedor_id ? Number(proveedor_id) : null,
          codigo: codigoClean,                                  // <-- guardar código
          cantidad: cantDec,
          fecha_ingreso: new Date(fecha_ingreso),
          fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
          estado: estadoFinal,
        },
      });


      // 2) Movimiento ENTRADA (misma cantidad base)
      await tx.movimientos_materia_prima.create({
        data: {
          tipo: 'ENTRADA',
          materia_prima_id: Number(materia_prima_id),
          lote_id: lote.id,
          cantidad: cantDec,
          motivo: `Creación de lote ${codigoClean}`,
          ref_tipo: 'LOTE',
          ref_id: lote.id,
        },
      });


      // 3) Sincronizar stock_total por aggregate (solo lotes DISPONIBLE)
      const agg = await tx.lotes_materia_prima.aggregate({
        where: { materia_prima_id: Number(materia_prima_id), estado: 'DISPONIBLE' },
        _sum: { cantidad: true },
      });
      const total = agg._sum.cantidad ?? new Prisma.Decimal('0.000');


      await tx.materias_primas.update({
        where: { id: Number(materia_prima_id) },
        data: { stock_total: total },
      });


      return lote;
    });


    return res.status(201).json(nuevoLote);
  } catch (err) {
    // Unicidad Prisma
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un lote con ese código para la misma materia prima' });
    }
    console.error('crearLote error:', err?.message, err?.code, err?.meta);
    return res.status(500).json({ message: 'Error al crear lote' });
  }
};


/** Listar lotes (ahora puede filtrar por `codigo`) */
exports.listarLotes = async (req, res) => {
  try {
    const { estado, materia_prima_id, proveedor_id, codigo, q } = req.query;


    const where = {};
    if (estado && ESTADOS_VALIDOS.includes(estado)) where.estado = estado;
    if (materia_prima_id) where.materia_prima_id = Number(materia_prima_id);
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);


    const code = cleanCodigo(codigo || q);
    if (code) {
      // búsqueda parcial por código
      where.codigo = { contains: code };
    }


    const lotes = await prisma.lotes_materia_prima.findMany({
      where,
      include: {
        materias_primas: { select: { id: true, nombre: true, unidad_medida: true, stock_total: true } },
        proveedores: { select: { id: true, nombre: true } },
      },
      orderBy: [{ fecha_ingreso: 'desc' }, { codigo: 'asc' }, { id: 'desc' }],
    });


    return res.json(lotes);
  } catch (err) {
    console.error('listarLotes error:', err?.message, err?.stack);
    return res.status(500).json({ message: 'Error al listar lotes' });
  }
};


/** Actualizar lote (ahora permite cambiar `codigo` con validación de unicidad) */
exports.actualizarLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      codigo,                    // <-- NUEVO
      cantidad,
      unidad,
      fecha_ingreso,
      fecha_vencimiento,
      estado,
      proveedor_id
    } = req.body;


    const lote = await prisma.lotes_materia_prima.findUnique({
      where: { id },
      include: { materias_primas: true }, // necesitamos la unidad de la MP
    });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });


    // Validar/chequear cambio de código
    let codigoClean;
    if (codigo !== undefined) {
      codigoClean = cleanCodigo(codigo);
      if (!codigoClean) {
        return res.status(400).json({ message: 'El código/número de lote no puede estar vacío' });
      }
      if (codigoClean !== lote.codigo) {
        const dup = await prisma.lotes_materia_prima.findFirst({
          where: {
            id: { not: id },
            materia_prima_id: lote.materia_prima_id,
            codigo: codigoClean
          },
          select: { id: true }
        });
        if (dup) {
          return res.status(409).json({ message: `Ya existe otro lote con código "${codigoClean}" para esta materia prima` });
        }
      }
    }


    // Cantidad / unidad
    let nuevaCantidadDec;
    if (cantidad !== undefined) {
      if (unidad !== undefined) {
        try {
          const { qtyBase } = coerceToMpBase(Number(cantidad), unidad, lote.materias_primas.unidad_medida);
          nuevaCantidadDec = toDec(qtyBase);
        } catch (e) {
          return res.status(400).json({ message: e.message || 'Unidad inválida/incompatible' });
        }
      } else {
        nuevaCantidadDec = toDec(cantidad);
      }
      if (nuevaCantidadDec.lt(0)) {
        return res.status(400).json({ message: 'La cantidad del lote no puede ser negativa' });
      }
    } else {
      nuevaCantidadDec = toDec(lote.cantidad);
    }


    const estadoFinal = estado && ESTADOS_VALIDOS.includes(String(estado)) ? estado : undefined;
    const finalEstado = estadoFinal || lote.estado;
    if (finalEstado === 'DISPONIBLE' && nuevaCantidadDec.lt(0)) {
      return res.status(400).json({ message: 'Un lote DISPONIBLE no puede tener cantidad negativa' });
    }


    const updated = await prisma.$transaction(async (tx) => {
      // update lote
      const upd = await tx.lotes_materia_prima.update({
        where: { id },
        data: {
          ...(codigo !== undefined ? { codigo: codigoClean } : {}),
          ...(cantidad !== undefined ? { cantidad: nuevaCantidadDec } : {}),
          ...(proveedor_id !== undefined ? { proveedor_id: proveedor_id ? Number(proveedor_id) : null } : {}),
          ...(fecha_ingreso ? { fecha_ingreso: new Date(fecha_ingreso) } : {}),
          ...(fecha_vencimiento !== undefined
            ? { fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null }
            : {}),
          ...(estadoFinal ? { estado: estadoFinal } : {}),
        },
      });


      // resincronizar stock_total
      const agg = await tx.lotes_materia_prima.aggregate({
        where: { materia_prima_id: upd.materia_prima_id, estado: 'DISPONIBLE' },
        _sum: { cantidad: true },
      });
      const total = agg._sum.cantidad ?? new Prisma.Decimal('0.000');
      await tx.materias_primas.update({
        where: { id: upd.materia_prima_id },
        data: { stock_total: total },
      });


      return upd;
    });


    return res.json(updated);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un lote con ese código para la misma materia prima' });
    }
    console.error('actualizarLote error:', err?.message, err?.code, err?.meta);
    return res.status(500).json({ message: 'Error al actualizar lote' });
  }
};


/** Eliminar lote (soft por defecto) — sincroniza stock_total por aggregate */
exports.eliminarLote = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const hard = String(req.query.hard || '').toLowerCase() === 'true';


    const lote = await prisma.lotes_materia_prima.findUnique({ where: { id } });
    if (!lote) return res.status(404).json({ message: 'Lote no encontrado' });


    // SOFT DELETE → marcar INACTIVO
    if (!hard) {
      if (lote.estado === 'INACTIVO') {
        return res.json({ message: 'El lote ya está inactivo' });
      }


      await prisma.$transaction(async (tx) => {
        await tx.lotes_materia_prima.update({
          where: { id },
          data: { estado: 'INACTIVO' },
        });


        // sincronizar stock_total por aggregate (solo lotes DISPONIBLE)
        const agg = await tx.lotes_materia_prima.aggregate({
          where: { materia_prima_id: lote.materia_prima_id, estado: 'DISPONIBLE' },
          _sum: { cantidad: true },
        });
        const total = agg._sum.cantidad ?? new Prisma.Decimal('0.000');
        await tx.materias_primas.update({
          where: { id: lote.materia_prima_id },
          data: { stock_total: total },
        });
      });


      return res.json({ message: 'Lote marcado como inactivo' });
    }


    // HARD DELETE → pre-check de referencias
    const [trazas, movimientos] = await Promise.all([
      prisma.trazabilidad_produccion.count({ where: { lote_id: id } }),
      prisma.movimientos_materia_prima.count({ where: { lote_id: id } }),
    ]);


    if (trazas + movimientos > 0) {
      return res.status(409).json({
        message:
          'No se puede eliminar definitivamente: el lote está referenciado en trazabilidad/movimientos. Inactívelo.',
        refs: { trazabilidad: trazas, movimientos },
      });
    }


    // Intentar borrar y resincronizar stock
    try {
      await prisma.$transaction(async (tx) => {
        await tx.lotes_materia_prima.delete({ where: { id } });


        // sincronizar stock_total por aggregate (solo lotes DISPONIBLE)
        const agg = await tx.lotes_materia_prima.aggregate({
          where: { materia_prima_id: lote.materia_prima_id, estado: 'DISPONIBLE' },
          _sum: { cantidad: true },
        });
        const total = agg._sum.cantidad ?? new Prisma.Decimal('0.000');
        await tx.materias_primas.update({
          where: { id: lote.materia_prima_id },
          data: { stock_total: total },
        });
      });


      return res.json({ message: 'Lote eliminado definitivamente' });
    } catch (e) {
      // Prisma FK error → 409 Conflict
      if (e?.code === 'P2003') {
        return res.status(409).json({
          message:
            'No se puede eliminar definitivamente por referencias (FK). Inactívelo.',
        });
      }
      throw e;
    }
  } catch (err) {
    console.error('eliminarLote error:', err?.message, err?.code, err?.meta);
    return res.status(500).json({ message: 'Error al eliminar lote' });
  }
};





