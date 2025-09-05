// src/controllers/recetaProductoMap.controller.js
const prisma = require('../database/prismaClient');


const VBASE = new Set(['PRODUCCION', 'EMPAQUE', 'HORNEO']);


function toPosInt(x) {
  const n = Number(x);
  return Number.isInteger(n) && n >= 0 ? n : null;
}


// GET /api/recetas/:id/productos-map
async function listarPorReceta(req, res) {
  try {
    const receta_id = Number(req.params.id);
    const rec = await prisma.recetas.findUnique({ where: { id: receta_id } });
    if (!rec) return res.status(404).json({ message: 'Receta no encontrada' });


    const rows = await prisma.receta_producto_map.findMany({
      where: { receta_id },
      orderBy: [{ producto_id: 'asc' }],
      include: {
        producto: {
          select: { id: true, nombre: true, requiere_congelacion_previa: true },
        },
      },
    });
    res.json(rows);
  } catch (e) {
    console.error('[map.listarPorReceta]', e);
    res.status(500).json({ message: 'Error listando mapeos' });
  }
}


// POST /api/recetas/:id/productos-map
// body: { producto_id, unidades_por_batch, vida_util_dias, vencimiento_base }
async function crear(req, res) {
  try {
    const receta_id = Number(req.params.id);
    const { producto_id, unidades_por_batch, vida_util_dias, vencimiento_base } = req.body;


    if (!producto_id) return res.status(400).json({ message: 'producto_id es obligatorio' });
    const und = toPosInt(unidades_por_batch);
    if (!(und && und > 0)) {
      return res.status(400).json({ message: 'unidades_por_batch debe ser entero > 0' });
    }


    const vida = toPosInt(vida_util_dias);
    if (vida === null) {
      return res.status(400).json({ message: 'vida_util_dias debe ser entero ≥ 0' });
    }


    const base = String(vencimiento_base || '').toUpperCase();
    if (!VBASE.has(base)) {
      return res.status(400).json({ message: 'vencimiento_base inválido (PRODUCCION|EMPAQUE|HORNEO)' });
    }


    const [rec, prod] = await Promise.all([
      prisma.recetas.findUnique({ where: { id: receta_id } }),
      prisma.productos_terminados.findUnique({ where: { id: Number(producto_id) } }),
    ]);
    if (!rec) return res.status(404).json({ message: 'Receta no encontrada' });
    if (!prod) return res.status(404).json({ message: 'Producto no encontrado' });


    const created = await prisma.receta_producto_map.create({
      data: {
        receta_id,
        producto_id: Number(producto_id),
        unidades_por_batch: und,
        vida_util_dias: vida,
        vencimiento_base: base,
      },
      include: {
        producto: { select: { id: true, nombre: true, requiere_congelacion_previa: true } },
      },
    });


    res.status(201).json(created);
  } catch (e) {
    console.error('[map.crear]', e);
    if (e?.code === 'P2002') {
      return res.status(400).json({ message: 'Ya existe mapeo receta↔producto' });
    }
    res.status(500).json({ message: 'Error creando mapeo' });
  }
}


// PUT /api/recetas/productos-map/:mapId
// body: { unidades_por_batch?, vida_util_dias?, vencimiento_base? }
async function actualizar(req, res) {
  try {
    const mapId = Number(req.params.mapId);
    const body = req.body;


    const exists = await prisma.receta_producto_map.findUnique({ where: { id: mapId } });
    if (!exists) return res.status(404).json({ message: 'Mapeo no encontrado' });


    const data = {};
    if (body.unidades_por_batch !== undefined) {
      const und = toPosInt(body.unidades_por_batch);
      if (!(und && und > 0)) {
        return res.status(400).json({ message: 'unidades_por_batch debe ser entero > 0' });
      }
      data.unidades_por_batch = und;
    }
    if (body.vida_util_dias !== undefined) {
      const vida = toPosInt(body.vida_util_dias);
      if (vida === null) {
        return res.status(400).json({ message: 'vida_util_dias debe ser entero ≥ 0' });
      }
      data.vida_util_dias = vida;
    }
    if (body.vencimiento_base !== undefined) {
      const base = String(body.vencimiento_base || '').toUpperCase();
      if (!VBASE.has(base)) {
        return res.status(400).json({ message: 'vencimiento_base inválido (PRODUCCION|EMPAQUE|HORNEO)' });
      }
      data.vencimiento_base = base;
    }


    const updated = await prisma.receta_producto_map.update({
      where: { id: mapId },
      data,
      include: { producto: { select: { id: true, nombre: true, requiere_congelacion_previa: true } } },
    });


    res.json(updated);
  } catch (e) {
    console.error('[map.actualizar]', e);
    res.status(500).json({ message: 'Error actualizando mapeo' });
  }
}


// DELETE /api/recetas/productos-map/:mapId
async function eliminar(req, res) {
  try {
    const mapId = Number(req.params.mapId);
    const exists = await prisma.receta_producto_map.findUnique({ where: { id: mapId } });
    if (!exists) return res.status(404).json({ message: 'Mapeo no encontrado' });


    await prisma.receta_producto_map.delete({ where: { id: mapId } });
    res.json({ message: 'Mapeo eliminado' });
  } catch (e) {
    console.error('[map.eliminar]', e);
    res.status(500).json({ message: 'Error eliminando mapeo' });
  }
}


module.exports = {
  listarPorReceta,
  crear,
  actualizar,
  eliminar,
};





