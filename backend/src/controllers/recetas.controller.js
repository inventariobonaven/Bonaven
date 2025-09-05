// src/controllers/recetas.controller.js
const prisma = require('../database/prismaClient');
const { Prisma } = require('../generated/prisma');
const { coerceToMpBase } = require('../utils/units');

/* ================= Helpers ================= */
const toDec = (x) => {
  if (x === null || x === undefined) return new Prisma.Decimal('0');
  if (x instanceof Prisma.Decimal) return x;
  if (typeof x === 'string') return new Prisma.Decimal(x);
  const n = Number(x);
  return new Prisma.Decimal(Number.isFinite(n) ? n.toFixed(3) : '0');
};

const toPosIntOrNull = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = parseInt(x, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
};

const isValidVencBase = (v) =>
  [Prisma.VencimientoBase.PRODUCCION, Prisma.VencimientoBase.EMPAQUE, Prisma.VencimientoBase.HORNEO].includes(
    String(v).toUpperCase?.() ? Prisma.VencimientoBase[String(v).toUpperCase()] : v
  );

const parseVencBase = (v) =>
  String(v).toUpperCase?.() ? Prisma.VencimientoBase[String(v).toUpperCase()] : v;

/* ====== include base para devolver la receta con todo lo útil ====== */
const includeReceta = {
  productos_terminados: { select: { id: true, nombre: true } },
  categoria: { select: { id: true, nombre: true } },
  ingredientes_receta: {
    include: {
      materias_primas: { select: { id: true, nombre: true, unidad_medida: true } },
    },
    orderBy: { id: 'asc' },
  },
  // NUEVO: mapeos receta⇄producto (rendimiento/unidades/vencimiento)
  producto_maps: {
    include: {
      producto: {
        select: { id: true, nombre: true, requiere_congelacion_previa: true, empaque_mp_id: true, bolsas_por_unidad: true, unidades_por_empaque: true },
      },
    },
    orderBy: { id: 'asc' },
  },
};

/* ================= Recetas ================= */

// GET /api/recetas
exports.listar = async (req, res) => {
  try {
    const { producto_id, categoria_id, estado, q } = req.query;
    const where = {};

    if (producto_id) where.producto_id = Number(producto_id);
    if (categoria_id) where.categoria_id = Number(categoria_id);
    if (estado === 'true') where.estado = true;
    if (estado === 'false') where.estado = false;

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { nombre: { contains: term, mode: 'insensitive' } },
        { productos_terminados: { is: { nombre: { contains: term, mode: 'insensitive' } } } },
        { categoria: { is: { nombre: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const data = await prisma.recetas.findMany({
      where,
      include: includeReceta,
      orderBy: [{ id: 'desc' }],
      take: 300,
    });

    res.json(data);
  } catch (e) {
    console.error('[recetas.listar]', e);
    res.status(500).json({ message: 'Error listando recetas' });
  }
};

// GET /api/recetas/:id
exports.detalle = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await prisma.recetas.findUnique({ where: { id }, include: includeReceta });
    if (!r) return res.status(404).json({ message: 'Receta no encontrada' });
    res.json(r);
  } catch (e) {
    console.error('[recetas.detalle]', e);
    res.status(500).json({ message: 'Error obteniendo receta' });
  }
};

// POST /api/recetas
// body: {
//   producto_id?, categoria_id?, nombre, estado?, rendimiento_por_batch?,
//   ingredientes?: [{ materia_prima_id, cantidad, unidad? }],
//   mapeos?: [{ producto_id, unidades_por_batch, vida_util_dias, vencimiento_base }]
// }
exports.crear = async (req, res) => {
  try {
    const {
      producto_id,
      categoria_id,
      nombre,
      estado = true,
      rendimiento_por_batch,
      ingredientes = [],
      mapeos = [],
    } = req.body;

    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ message: 'Nombre es obligatorio' });
    }

    // refs opcionales
    if (producto_id) {
      const prod = await prisma.productos_terminados.findUnique({ where: { id: Number(producto_id) } });
      if (!prod) return res.status(404).json({ message: 'Producto terminado no encontrado' });
    }
    if (categoria_id) {
      const cat = await prisma.categorias_receta.findUnique({ where: { id: Number(categoria_id) } });
      if (!cat) return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    // rendimiento (si viene) > 0
    let rpbDec;
    if (rendimiento_por_batch !== undefined) {
      rpbDec = toDec(rendimiento_por_batch);
      if (rpbDec.lte(0)) return res.status(400).json({ message: 'rendimiento_por_batch debe ser > 0' });
    }

    // Validar ingredientes
    const matIds = new Set();
    for (const ing of ingredientes) {
      if (!ing.materia_prima_id || ing.cantidad === undefined) {
        return res.status(400).json({ message: 'Cada ingrediente requiere materia_prima_id y cantidad' });
      }
      if (!(Number(ing.cantidad) > 0)) {
        return res.status(400).json({ message: 'cantidad de ingrediente debe ser > 0' });
      }
      const key = String(ing.materia_prima_id);
      if (matIds.has(key)) {
        return res.status(400).json({ message: 'Ingrediente repetido para la misma materia prima' });
      }
      matIds.add(key);
    }

    // Validar mapeos iniciales (si vienen)
    for (const m of mapeos) {
      const pId = Number(m.producto_id);
      if (!pId) return res.status(400).json({ message: 'mapeo: producto_id es obligatorio' });

      const und = toPosIntOrNull(m.unidades_por_batch);
      if (und === null) return res.status(400).json({ message: 'mapeo: unidades_por_batch debe ser entero > 0' });

      const dias = toPosIntOrNull(m.vida_util_dias);
      if (dias === null) return res.status(400).json({ message: 'mapeo: vida_util_dias debe ser entero > 0' });

      if (!isValidVencBase(m.vencimiento_base)) {
        return res.status(400).json({ message: 'mapeo: vencimiento_base inválido (PRODUCCION|EMPAQUE|HORNEO)' });
      }

      const prod = await prisma.productos_terminados.findUnique({ where: { id: pId } });
      if (!prod) return res.status(404).json({ message: `Producto (${pId}) no encontrado` });
    }

    const recetaId = await prisma.$transaction(async (tx) => {
      const receta = await tx.recetas.create({
        data: {
          producto_id: producto_id ? Number(producto_id) : null,
          categoria_id: categoria_id ? Number(categoria_id) : null,
          nombre: String(nombre).trim(),
          estado: !!estado,
          ...(rpbDec ? { rendimiento_por_batch: rpbDec } : {}),
        },
      });

      if (ingredientes.length) {
        const payload = [];
        for (const ing of ingredientes) {
          const mp = await tx.materias_primas.findUnique({ where: { id: Number(ing.materia_prima_id) } });
          if (!mp) throw new Error('Materia prima no encontrada');

          let cantidadBase = Number(ing.cantidad);
          if (ing.unidad) {
            const { qtyBase } = coerceToMpBase(Number(ing.cantidad), String(ing.unidad), mp.unidad_medida);
            cantidadBase = qtyBase; // normalizado a unidad base de la MP
          }

          payload.push({
            receta_id: receta.id,
            materia_prima_id: Number(ing.materia_prima_id),
            cantidad: toDec(cantidadBase),
          });
        }

        await tx.ingredientes_receta.createMany({
          data: payload,
          skipDuplicates: true,
        });
      }

      if (mapeos.length) {
        for (const m of mapeos) {
          await tx.receta_producto_map.create({
            data: {
              receta_id: receta.id,
              producto_id: Number(m.producto_id),
              unidades_por_batch: toPosIntOrNull(m.unidades_por_batch),
              vida_util_dias: toPosIntOrNull(m.vida_util_dias),
              vencimiento_base: parseVencBase(m.vencimiento_base),
            },
          });
        }
      }

      return receta.id;
    });

    const full = await prisma.recetas.findUnique({ where: { id: recetaId }, include: includeReceta });
    res.status(201).json(full);
  } catch (e) {
    console.error('[recetas.crear]', e);
    if (e?.code === 'P2002') {
      return res.status(400).json({ message: 'Ya existe un mapeo receta↔producto duplicado' });
    }
    res.status(500).json({ message: 'Error creando receta' });
  }
};

// PUT /api/recetas/:id (no toca ingredientes en lote ni mapeos)
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      producto_id,
      categoria_id,
      nombre,
      estado,
      rendimiento_por_batch,
    } = req.body;

    const r = await prisma.recetas.findUnique({ where: { id } });
    if (!r) return res.status(404).json({ message: 'Receta no encontrada' });

    if (producto_id !== undefined && producto_id !== null) {
      if (producto_id) {
        const prod = await prisma.productos_terminados.findUnique({ where: { id: Number(producto_id) } });
        if (!prod) return res.status(404).json({ message: 'Producto terminado no encontrado' });
      }
    }
    if (categoria_id !== undefined && categoria_id !== null) {
      if (categoria_id) {
        const cat = await prisma.categorias_receta.findUnique({ where: { id: Number(categoria_id) } });
        if (!cat) return res.status(404).json({ message: 'Categoría no encontrada' });
      }
    }

    let rpbData = {};
    if (rendimiento_por_batch !== undefined) {
      const rpbDec = toDec(rendimiento_por_batch);
      if (rpbDec.lte(0)) return res.status(400).json({ message: 'rendimiento_por_batch debe ser > 0' });
      rpbData = { rendimiento_por_batch: rpbDec };
    }

    const updated = await prisma.recetas.update({
      where: { id },
      data: {
        ...(producto_id !== undefined ? { producto_id: producto_id ? Number(producto_id) : null } : {}),
        ...(categoria_id !== undefined ? { categoria_id: categoria_id ? Number(categoria_id) : null } : {}),
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(estado !== undefined ? { estado: !!estado } : {}),
        ...rpbData,
      },
      include: includeReceta,
    });

    res.json(updated);
  } catch (e) {
    console.error('[recetas.actualizar]', e);
    res.status(500).json({ message: 'Error actualizando receta' });
  }
};

// DELETE /api/recetas/:id  (soft por defecto) ?hard=true
exports.eliminar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const hard = String(req.query.hard || '').toLowerCase() === 'true';

    const r = await prisma.recetas.findUnique({ where: { id } });
    if (!r) return res.status(404).json({ message: 'Receta no encontrada' });

    if (hard) {
      const count = await prisma.producciones.count({ where: { receta_id: id } });
      if (count > 0) {
        return res.status(400).json({ message: 'No se puede eliminar: la receta tiene producciones asociadas' });
      }
      await prisma.ingredientes_receta.deleteMany({ where: { receta_id: id } });
      await prisma.recetas.delete({ where: { id } });
      return res.json({ message: 'Receta eliminada definitivamente' });
    }

    if (r.estado === false) return res.json({ message: 'La receta ya está inactiva' });
    await prisma.recetas.update({ where: { id }, data: { estado: false } });
    res.json({ message: 'Receta inactivada' });
  } catch (e) {
    console.error('[recetas.eliminar]', e);
    res.status(500).json({ message: 'Error eliminando receta' });
  }
};

// PATCH /api/recetas/:id/estado  body: { estado: true|false }
exports.toggleEstado = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;
    if (estado === undefined) return res.status(400).json({ message: 'estado requerido' });

    const r = await prisma.recetas.update({ where: { id }, data: { estado: !!estado }, include: includeReceta });
    res.json(r);
  } catch (e) {
    console.error('[recetas.toggleEstado]', e);
    res.status(500).json({ message: 'Error cambiando estado' });
  }
};

/* ============ Ingredientes (subrecurso) ============ */

// GET /api/recetas/:id/ingredientes
exports.listarIngredientes = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rec = await prisma.recetas.findUnique({ where: { id } });
    if (!rec) return res.status(404).json({ message: 'Receta no encontrada' });

    const ingredientes = await prisma.ingredientes_receta.findMany({
      where: { receta_id: id },
      include: { materias_primas: { select: { id: true, nombre: true, unidad_medida: true } } },
      orderBy: { id: 'asc' },
    });

    res.json(ingredientes);
  } catch (e) {
    console.error('[recetas.listarIngredientes]', e);
    res.status(500).json({ message: 'Error listando ingredientes' });
  }
};

// POST /api/recetas/:id/ingredientes  body: { materia_prima_id, cantidad, unidad? }
exports.agregarIngrediente = async (req, res) => {
  try {
    const receta_id = Number(req.params.id);
    const { materia_prima_id, cantidad, unidad } = req.body;

    if (!materia_prima_id || cantidad === undefined) {
      return res.status(400).json({ message: 'materia_prima_id y cantidad son obligatorios' });
    }
    if (!(Number(cantidad) > 0)) {
      return res.status(400).json({ message: 'cantidad debe ser > 0' });
    }

    const rec = await prisma.recetas.findUnique({ where: { id: receta_id } });
    if (!rec) return res.status(404).json({ message: 'Receta no encontrada' });

    const mp = await prisma.materias_primas.findUnique({ where: { id: Number(materia_prima_id) } });
    if (!mp) return res.status(404).json({ message: 'Materia prima no encontrada' });

    const existing = await prisma.ingredientes_receta.findUnique({
      where: { receta_id_materia_prima_id: { receta_id, materia_prima_id: Number(materia_prima_id) } },
    });
    if (existing) return res.status(400).json({ message: 'La materia prima ya está en la receta' });

    // convertir cantidad (g/ml/ud) -> unidad base
    let cantidadBaseNum = Number(cantidad);
    if (unidad) {
      const { qtyBase } = coerceToMpBase(Number(cantidad), String(unidad), mp.unidad_medida);
      cantidadBaseNum = qtyBase;
    }

    const created = await prisma.ingredientes_receta.create({
      data: {
        receta_id,
        materia_prima_id: Number(materia_prima_id),
        cantidad: toDec(cantidadBaseNum),
      },
      include: { materias_primas: { select: { id: true, nombre: true, unidad_medida: true } } },
    });

    res.status(201).json(created);
  } catch (e) {
    console.error('[recetas.agregarIngrediente]', e);
    res.status(500).json({ message: 'Error agregando ingrediente' });
  }
};

// PUT /api/recetas/ingredientes/:ingId  body: { cantidad, unidad? }
exports.actualizarIngrediente = async (req, res) => {
  try {
    const ingId = Number(req.params.ingId);
    const { cantidad, unidad } = req.body;
    if (cantidad === undefined) return res.status(400).json({ message: 'cantidad es obligatoria' });
    if (!(Number(cantidad) > 0)) return res.status(400).json({ message: 'cantidad debe ser > 0' });

    const exists = await prisma.ingredientes_receta.findUnique({
      where: { id: ingId },
      include: { materias_primas: true },
    });
    if (!exists) return res.status(404).json({ message: 'Ingrediente no encontrado' });

    let cantidadBaseNum = Number(cantidad);
    if (unidad) {
      const { qtyBase } = coerceToMpBase(Number(cantidad), String(unidad), exists.materias_primas.unidad_medida);
      cantidadBaseNum = qtyBase;
    }

    const updated = await prisma.ingredientes_receta.update({
      where: { id: ingId },
      data: {
        cantidad: toDec(cantidadBaseNum),
      },
      include: { materias_primas: { select: { id: true, nombre: true, unidad_medida: true } } },
    });

    res.json(updated);
  } catch (e) {
    console.error('[recetas.actualizarIngrediente]', e);
    res.status(500).json({ message: 'Error actualizando ingrediente' });
  }
};

// DELETE /api/recetas/ingredientes/:ingId
exports.eliminarIngrediente = async (req, res) => {
  try {
    const ingId = Number(req.params.ingId);
    const exists = await prisma.ingredientes_receta.findUnique({ where: { id: ingId } });
    if (!exists) return res.status(404).json({ message: 'Ingrediente no encontrado' });

    await prisma.ingredientes_receta.delete({ where: { id: ingId } });
    res.json({ message: 'Ingrediente eliminado' });
  } catch (e) {
    console.error('[recetas.eliminarIngrediente]', e);
    res.status(500).json({ message: 'Error eliminando ingrediente' });
  }
};

/* ============ Mapeos Receta ⇄ Producto (subrecurso) ============ */

// GET /api/recetas/:id/mapeos
exports.listarMapeos = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rec = await prisma.recetas.findUnique({ where: { id } });
    if (!rec) return res.status(404).json({ message: 'Receta no encontrada' });

    const rows = await prisma.receta_producto_map.findMany({
      where: { receta_id: id },
      include: { producto: { select: { id: true, nombre: true, requiere_congelacion_previa: true } } },
      orderBy: { id: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    console.error('[recetas.listarMapeos]', e);
    res.status(500).json({ message: 'Error listando mapeos' });
  }
};

// POST /api/recetas/:id/mapeos
// body: { producto_id, unidades_por_batch, vida_util_dias, vencimiento_base }
exports.crearMapeo = async (req, res) => {
  try {
    const receta_id = Number(req.params.id);
    const { producto_id, unidades_por_batch, vida_util_dias, vencimiento_base } = req.body;

    const rec = await prisma.recetas.findUnique({ where: { id: receta_id } });
    if (!rec) return res.status(404).json({ message: 'Receta no encontrada' });

    const pId = Number(producto_id);
    if (!pId) return res.status(400).json({ message: 'producto_id es obligatorio' });

    const und = toPosIntOrNull(unidades_por_batch);
    if (und === null) return res.status(400).json({ message: 'unidades_por_batch debe ser entero > 0' });

    const dias = toPosIntOrNull(vida_util_dias);
    if (dias === null) return res.status(400).json({ message: 'vida_util_dias debe ser entero > 0' });

    if (!isValidVencBase(vencimiento_base)) {
      return res.status(400).json({ message: 'vencimiento_base inválido (PRODUCCION|EMPAQUE|HORNEO)' });
    }

    const prod = await prisma.productos_terminados.findUnique({ where: { id: pId } });
    if (!prod) return res.status(404).json({ message: 'Producto no encontrado' });

    const created = await prisma.receta_producto_map.create({
      data: {
        receta_id,
        producto_id: pId,
        unidades_por_batch: und,
        vida_util_dias: dias,
        vencimiento_base: parseVencBase(vencimiento_base),
      },
      include: { producto: { select: { id: true, nombre: true, requiere_congelacion_previa: true } } },
    });

    res.status(201).json(created);
  } catch (e) {
    console.error('[recetas.crearMapeo]', e);
    if (e?.code === 'P2002') {
      return res.status(400).json({ message: 'Ya existe un mapeo de esta receta con ese producto' });
    }
    res.status(500).json({ message: 'Error creando mapeo' });
  }
};

// PUT /api/recetas/mapeos/:mapId
// body: { unidades_por_batch?, vida_util_dias?, vencimiento_base? }
exports.actualizarMapeo = async (req, res) => {
  try {
    const id = Number(req.params.mapId);
    const { unidades_por_batch, vida_util_dias, vencimiento_base } = req.body;

    const existing = await prisma.receta_producto_map.findUnique({
      where: { id },
      include: { producto: true, receta: true },
    });
    if (!existing) return res.status(404).json({ message: 'Mapeo no encontrado' });

    const data = {};

    if (unidades_por_batch !== undefined) {
      const und = toPosIntOrNull(unidades_por_batch);
      if (und === null) return res.status(400).json({ message: 'unidades_por_batch debe ser entero > 0' });
      data.unidades_por_batch = und;
    }
    if (vida_util_dias !== undefined) {
      const dias = toPosIntOrNull(vida_util_dias);
      if (dias === null) return res.status(400).json({ message: 'vida_util_dias debe ser entero > 0' });
      data.vida_util_dias = dias;
    }
    if (vencimiento_base !== undefined) {
      if (!isValidVencBase(vencimiento_base)) {
        return res.status(400).json({ message: 'vencimiento_base inválido (PRODUCCION|EMPAQUE|HORNEO)' });
      }
      data.vencimiento_base = parseVencBase(vencimiento_base);
    }

    const updated = await prisma.receta_producto_map.update({
      where: { id },
      data,
      include: { producto: { select: { id: true, nombre: true, requiere_congelacion_previa: true } } },
    });

    res.json(updated);
  } catch (e) {
    console.error('[recetas.actualizarMapeo]', e);
    res.status(500).json({ message: 'Error actualizando mapeo' });
  }
};

// DELETE /api/recetas/mapeos/:mapId
exports.eliminarMapeo = async (req, res) => {
  try {
    const id = Number(req.params.mapId);
    const exists = await prisma.receta_producto_map.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: 'Mapeo no encontrado' });

    // Si ya existen producciones que referencien este mapeo (por lógica futura), aquí validarías.
    await prisma.receta_producto_map.delete({ where: { id } });
    res.json({ message: 'Mapeo eliminado' });
  } catch (e) {
    console.error('[recetas.eliminarMapeo]', e);
    res.status(500).json({ message: 'Error eliminando mapeo' });
  }
};



