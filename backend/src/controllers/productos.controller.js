// src/controllers/productos.controller.js
const prisma = require('../database/prismaClient');
const { Prisma } = require('../generated/prisma');

/* ======================== HELPERS ======================== */
const toDec = (x) => {
  if (x instanceof Prisma.Decimal) return x;
  if (x === null || x === undefined) return new Prisma.Decimal('0');
  if (typeof x === 'string') return new Prisma.Decimal(x);
  return new Prisma.Decimal(Number(x).toFixed(3));
};

const isPositiveDec = (x) => {
  try {
    return toDec(x).gt(0);
  } catch {
    return false;
  }
};

const toPosIntOrNull = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = parseInt(x, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
};

const toBool = (v, def = false) => {
  if (v === undefined) return def;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

const parseIdParam = (v) => {
  const id = Number(v);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isEmpaque = (mp) =>
  String(mp?.tipo || '')
    .toLowerCase()
    .includes('empaque');

/* ======================== LISTAR ======================== */
exports.listar = async (req, res) => {
  try {
    const { q, estado, requiere_congelacion_previa, micomercio_id } = req.query;
    const where = {};

    if (q && q.trim()) where.nombre = { contains: q.trim(), mode: 'insensitive' };

    if (estado === 'true') where.estado = true;
    if (estado === 'false') where.estado = false;

    if (requiere_congelacion_previa === 'true') where.requiere_congelacion_previa = true;
    if (requiere_congelacion_previa === 'false') where.requiere_congelacion_previa = false;

    if (micomercio_id !== undefined && micomercio_id !== '') {
      const ext = toPosIntOrNull(micomercio_id);
      if (ext === null)
        return res.status(400).json({ message: 'micomercio_id inválido (debe ser entero > 0)' });
      where.micomercio_id = ext;
    }

    const data = await prisma.productos_terminados.findMany({
      where,
      orderBy: [{ nombre: 'asc' }],
      take: 500,
      include: {
        presentaciones: true,
        recetas: { select: { id: true, nombre: true } },
        materias_primas_empaque: {
          select: { id: true, nombre: true, unidad_medida: true, tipo: true },
        },
      },
    });

    res.json(data);
  } catch (e) {
    console.error('[productos.listar]', e);
    res.status(500).json({ message: 'Error listando productos' });
  }
};

/* ======================== DETALLE ======================== */
exports.detalle = async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const item = await prisma.productos_terminados.findUnique({
      where: { id },
      include: {
        presentaciones: true,
        recetas: true,
        materias_primas_empaque: {
          select: { id: true, nombre: true, unidad_medida: true, tipo: true },
        },
      },
    });

    if (!item) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(item);
  } catch (e) {
    console.error('[productos.detalle]', e);
    res.status(500).json({ message: 'Error obteniendo producto' });
  }
};

/* ======================== CREAR ======================== */
exports.crear = async (req, res) => {
  try {
    const {
      nombre,
      estado = true,
      empaque_mp_id = null,
      bolsas_por_unidad = '1',
      unidades_por_empaque = null,
      descripcion_contenido = null,
      requiere_congelacion_previa = false,
      micomercio_id = null,
    } = req.body;

    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ message: 'Nombre es obligatorio (mínimo 2 caracteres)' });
    }

    // micomercio_id (int > 0 o null)
    const micomercioId =
      micomercio_id === null || micomercio_id === undefined || micomercio_id === ''
        ? null
        : toPosIntOrNull(micomercio_id);

    if (
      micomercio_id !== null &&
      micomercio_id !== undefined &&
      micomercio_id !== '' &&
      micomercioId === null
    ) {
      return res.status(400).json({ message: 'micomercio_id debe ser un entero > 0' });
    }

    // Validar empaque si viene
    let empaqueId = null;
    if (empaque_mp_id !== null && empaque_mp_id !== undefined && empaque_mp_id !== '') {
      empaqueId = Number(empaque_mp_id);
      if (!Number.isFinite(empaqueId) || empaqueId <= 0) {
        return res.status(400).json({ message: 'empaque_mp_id inválido' });
      }
      const mp = await prisma.materias_primas.findUnique({ where: { id: empaqueId } });
      if (!mp) return res.status(404).json({ message: 'Materia prima (empaque) no encontrada' });
      if (!isEmpaque(mp)) {
        return res
          .status(400)
          .json({ message: 'La materia prima seleccionada no es de tipo Empaque' });
      }
    }

    // Validaciones numéricas
    if (!isPositiveDec(bolsas_por_unidad)) {
      return res.status(400).json({ message: 'bolsas_por_unidad debe ser > 0' });
    }

    const undInt = toPosIntOrNull(unidades_por_empaque);
    if (unidades_por_empaque !== null && unidades_por_empaque !== undefined && undInt === null) {
      return res.status(400).json({ message: 'unidades_por_empaque debe ser un entero > 0' });
    }

    const created = await prisma.productos_terminados.create({
      data: {
        nombre: String(nombre).trim(),
        estado: toBool(estado, true),
        empaque_mp_id: empaqueId,
        bolsas_por_unidad: toDec(bolsas_por_unidad),
        unidades_por_empaque: undInt,
        descripcion_contenido: descripcion_contenido ? String(descripcion_contenido).trim() : null,
        requiere_congelacion_previa: toBool(requiere_congelacion_previa, false),
        micomercio_id: micomercioId,
      },
      include: {
        materias_primas_empaque: {
          select: { id: true, nombre: true, unidad_medida: true, tipo: true },
        },
      },
    });

    res.status(201).json(created);
  } catch (e) {
    console.error('[productos.crear]', e);

    // P2002: unique violation (nombre o micomercio_id)
    if (e?.code === 'P2002') {
      const target = Array.isArray(e?.meta?.target)
        ? e.meta.target.join(',')
        : String(e?.meta?.target || '');
      if (target.includes('nombre')) {
        return res.status(409).json({ message: 'Ya existe un producto con ese nombre' });
      }
      if (target.includes('micomercio_id')) {
        return res
          .status(409)
          .json({ message: 'Ese micomercio_id ya está asignado a otro producto' });
      }
      return res
        .status(409)
        .json({ message: 'Violación de único: nombre o micomercio_id ya existen' });
    }

    res.status(500).json({ message: 'Error creando producto' });
  }
};

/* ======================== ACTUALIZAR ======================== */
exports.actualizar = async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const {
      nombre,
      estado,
      empaque_mp_id,
      bolsas_por_unidad,
      unidades_por_empaque,
      descripcion_contenido,
      requiere_congelacion_previa,
      micomercio_id,
    } = req.body;

    // micomercio_id (permite null para desvincular)
    let micomercioIdData;
    if (micomercio_id !== undefined) {
      if (micomercio_id === null || micomercio_id === '') {
        micomercioIdData = null;
      } else {
        const ext = toPosIntOrNull(micomercio_id);
        if (ext === null)
          return res.status(400).json({ message: 'micomercio_id debe ser un entero > 0' });
        micomercioIdData = ext;
      }
    }

    // empaque_mp_id
    let empaqueIdData;
    if (empaque_mp_id !== undefined) {
      if (empaque_mp_id === null || empaque_mp_id === '') {
        empaqueIdData = null;
      } else {
        const empaqueId = Number(empaque_mp_id);
        if (!Number.isFinite(empaqueId) || empaqueId <= 0) {
          return res.status(400).json({ message: 'empaque_mp_id inválido' });
        }
        const mp = await prisma.materias_primas.findUnique({ where: { id: empaqueId } });
        if (!mp) return res.status(404).json({ message: 'Materia prima (empaque) no encontrada' });
        if (!isEmpaque(mp)) {
          return res
            .status(400)
            .json({ message: 'La materia prima seleccionada no es de tipo Empaque' });
        }
        empaqueIdData = empaqueId;
      }
    }

    // bolsas_por_unidad
    let bolsasData;
    if (bolsas_por_unidad !== undefined) {
      if (!isPositiveDec(bolsas_por_unidad)) {
        return res.status(400).json({ message: 'bolsas_por_unidad debe ser > 0' });
      }
      bolsasData = toDec(bolsas_por_unidad);
    }

    // unidades_por_empaque
    let unidadesData;
    if (unidades_por_empaque !== undefined) {
      if (unidades_por_empaque === null || unidades_por_empaque === '') {
        unidadesData = null; // permitir borrar
      } else {
        const undInt = toPosIntOrNull(unidades_por_empaque);
        if (undInt === null) {
          return res.status(400).json({ message: 'unidades_por_empaque debe ser un entero > 0' });
        }
        unidadesData = undInt;
      }
    }

    const updated = await prisma.productos_terminados.update({
      where: { id },
      data: {
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(estado !== undefined ? { estado: toBool(estado) } : {}),
        ...(empaque_mp_id !== undefined ? { empaque_mp_id: empaqueIdData } : {}),
        ...(bolsas_por_unidad !== undefined ? { bolsas_por_unidad: bolsasData } : {}),
        ...(unidades_por_empaque !== undefined ? { unidades_por_empaque: unidadesData } : {}),
        ...(descripcion_contenido !== undefined
          ? {
              descripcion_contenido: descripcion_contenido
                ? String(descripcion_contenido).trim()
                : null,
            }
          : {}),
        ...(requiere_congelacion_previa !== undefined
          ? { requiere_congelacion_previa: toBool(requiere_congelacion_previa) }
          : {}),
        ...(micomercio_id !== undefined ? { micomercio_id: micomercioIdData } : {}),
      },
      include: {
        materias_primas_empaque: {
          select: { id: true, nombre: true, unidad_medida: true, tipo: true },
        },
      },
    });

    res.json(updated);
  } catch (e) {
    console.error('[productos.actualizar]', e);

    if (e?.code === 'P2002') {
      const target = Array.isArray(e?.meta?.target)
        ? e.meta.target.join(',')
        : String(e?.meta?.target || '');
      if (target.includes('nombre')) {
        return res.status(409).json({ message: 'Ya existe un producto con ese nombre' });
      }
      if (target.includes('micomercio_id')) {
        return res
          .status(409)
          .json({ message: 'Ese micomercio_id ya está asignado a otro producto' });
      }
      return res.status(409).json({ message: 'Violación de único (nombre o micomercio_id)' });
    }

    if (e?.code === 'P2025') {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.status(500).json({ message: 'Error actualizando producto' });
  }
};

/* ======================== ELIMINAR ======================== */
exports.eliminar = async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const [presCount, recCount, stockCount] = await Promise.all([
      prisma.presentaciones.count({ where: { producto_id: id } }),
      prisma.recetas.count({ where: { producto_id: id } }),
      prisma.stock_producto_terminado.count({ where: { producto_id: id } }),
    ]);

    if (presCount > 0 || recCount > 0 || stockCount > 0) {
      return res.status(400).json({
        message:
          'No se puede eliminar: tiene presentaciones/recetas o movimientos de stock asociados',
      });
    }

    await prisma.productos_terminados.delete({ where: { id } });
    res.json({ message: 'Producto eliminado' });
  } catch (e) {
    console.error('[productos.eliminar]', e);
    if (e?.code === 'P2025') return res.status(404).json({ message: 'Producto no encontrado' });
    res.status(500).json({ message: 'Error eliminando producto' });
  }
};

/* ======================== TOGGLE ESTADO ======================== */
exports.toggleEstado = async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const { estado } = req.body;
    if (estado === undefined) return res.status(400).json({ message: 'estado requerido' });

    const updated = await prisma.productos_terminados.update({
      where: { id },
      data: { estado: toBool(estado) },
      include: {
        materias_primas_empaque: {
          select: { id: true, nombre: true, unidad_medida: true, tipo: true },
        },
      },
    });

    res.json(updated);
  } catch (e) {
    console.error('[productos.toggleEstado]', e);
    res.status(500).json({ message: 'Error cambiando estado' });
  }
};

/* ======================== TOGGLE CONGELACIÓN ======================== */
exports.toggleCongelacion = async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ message: 'id inválido' });

    const { requiere_congelacion_previa } = req.body;
    if (requiere_congelacion_previa === undefined) {
      return res.status(400).json({ message: 'requiere_congelacion_previa requerido' });
    }

    const updated = await prisma.productos_terminados.update({
      where: { id },
      data: { requiere_congelacion_previa: toBool(requiere_congelacion_previa) },
      include: {
        materias_primas_empaque: {
          select: { id: true, nombre: true, unidad_medida: true, tipo: true },
        },
      },
    });

    res.json(updated);
  } catch (e) {
    console.error('[productos.toggleCongelacion]', e);
    res.status(500).json({ message: 'Error cambiando flag de congelación' });
  }
};
