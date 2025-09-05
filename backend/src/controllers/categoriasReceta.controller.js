// src/controllers/categoriasReceta.controller.js
const prisma = require('../database/prismaClient');

// GET /api/categorias-receta
exports.listar = async (req, res) => {
  try {
    const { q, estado } = req.query;
    const where = {};
    if (q?.trim()) where.nombre = { contains: q.trim(), mode: 'insensitive' };
    if (estado === 'true') where.estado = true;
    if (estado === 'false') where.estado = false;

    const data = await prisma.categorias_receta.findMany({
      where,
      orderBy: [{ estado: 'desc' }, { nombre: 'asc' }],
    });
    res.json(data);
  } catch (e) {
    console.error('[categorias.listar]', e);
    res.status(500).json({ message: 'Error listando categorías' });
  }
};

// GET /api/categorias-receta/:id
exports.detalle = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cat = await prisma.categorias_receta.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ message: 'Categoría no encontrada' });
    res.json(cat);
  } catch (e) {
    console.error('[categorias.detalle]', e);
    res.status(500).json({ message: 'Error obteniendo categoría' });
  }
};

// POST /api/categorias-receta  body: { nombre, estado? }
exports.crear = async (req, res) => {
  try {
    const { nombre, estado = true } = req.body;
    if (!nombre?.trim()) {
      return res.status(400).json({ message: 'Nombre es obligatorio' });
    }
    const dup = await prisma.categorias_receta.findFirst({
      where: { nombre: { equals: nombre.trim(), mode: 'insensitive' } },
    });
    if (dup) return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });

    const created = await prisma.categorias_receta.create({
      data: { nombre: nombre.trim(), estado: !!estado },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('[categorias.crear]', e);
    res.status(500).json({ message: 'Error creando categoría' });
  }
};

// PUT /api/categorias-receta/:id  body: { nombre?, estado? }
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, estado } = req.body;

    const exists = await prisma.categorias_receta.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: 'Categoría no encontrada' });

    if (typeof nombre === 'string' && nombre.trim().toLowerCase() !== exists.nombre.toLowerCase()) {
      const dup = await prisma.categorias_receta.findFirst({
        where: { nombre: { equals: nombre.trim(), mode: 'insensitive' }, NOT: { id } },
      });
      if (dup) return res.status(409).json({ message: 'Ya existe otra categoría con ese nombre' });
    }

    const updated = await prisma.categorias_receta.update({
      where: { id },
      data: {
        ...(typeof nombre === 'string' ? { nombre: nombre.trim() } : {}),
        ...(typeof estado === 'boolean' ? { estado } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    console.error('[categorias.actualizar]', e);
    res.status(500).json({ message: 'Error actualizando categoría' });
  }
};

// PATCH /api/categorias-receta/:id/estado  body: { estado: boolean }
exports.toggleEstado = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;
    if (estado === undefined) return res.status(400).json({ message: 'estado requerido' });
    const updated = await prisma.categorias_receta.update({ where: { id }, data: { estado: !!estado } });
    res.json(updated);
  } catch (e) {
    console.error('[categorias.toggleEstado]', e);
    res.status(500).json({ message: 'Error cambiando estado' });
  }
};

// DELETE /api/categorias-receta/:id  (soft por defecto) ?hard=true
exports.eliminar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const hard = String(req.query.hard || '').toLowerCase() === 'true';

    const cat = await prisma.categorias_receta.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ message: 'Categoría no encontrada' });

    if (hard) {
      const usadas = await prisma.recetas.count({ where: { categoria_id: id } });
      if (usadas > 0) {
        return res.status(400).json({ message: 'No se puede eliminar: hay recetas asociadas' });
      }
      await prisma.categorias_receta.delete({ where: { id } });
      return res.json({ message: 'Categoría eliminada' });
    }

    if (cat.estado === false) return res.json({ message: 'La categoría ya está inactiva' });
    await prisma.categorias_receta.update({ where: { id }, data: { estado: false } });
    res.json({ message: 'Categoría inactivada' });
  } catch (e) {
    console.error('[categorias.eliminar]', e);
    res.status(500).json({ message: 'Error eliminando categoría' });
  }
};


