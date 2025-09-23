// src/controllers/materiasPrimas.controller.js
const prisma = require('../database/prismaClient');

/* ------------ helpers ------------ */
const toBool = (v) => /^(1|true|yes|on)$/i.test(String(v || '').trim());
const norm = (s) => String(s || '').trim();

/* ========== Crear ========== */
async function crearMateriaPrima(req, res) {
  try {
    const { nombre, tipo, unidad_medida, estado } = req.body;

    if (!nombre?.trim() || !tipo?.trim() || !unidad_medida?.trim()) {
      return res.status(400).json({ message: 'nombre, tipo y unidad_medida son obligatorios' });
    }

    const existe = await prisma.materias_primas.findFirst({
      where: { nombre: { equals: nombre.trim(), mode: 'insensitive' } },
    });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe una materia prima con ese nombre' });
    }

    const nueva = await prisma.materias_primas.create({
      data: {
        nombre: nombre.trim(),
        tipo: tipo.trim(),
        unidad_medida: unidad_medida.trim(),
        estado: typeof estado === 'boolean' ? estado : true,
        stock_total: 0,
      },
    });

    res.status(201).json(nueva);
  } catch (err) {
    console.error('crearMateriaPrima error:', err);
    res.status(500).json({ message: 'Error al crear materia prima' });
  }
}

/* ========== Listar ========== */
/**
 * GET /materias-primas
 * Soporta:
 *  - ?estado=true|false
 *  - ?q=texto libre
 *  - ?tipo=fragmento (insensitive)
 *  - ?sinEmpaques=1  → excluye tipo EMPAQUE
 */
async function listarMateriasPrimas(req, res) {
  try {
    const { estado, q, tipo, sinEmpaques } = req.query;

    const where = {};
    const AND = [];

    if (estado === 'true') where.estado = true;
    if (estado === 'false') where.estado = false;

    if (tipo?.trim()) {
      AND.push({ tipo: { contains: tipo.trim(), mode: 'insensitive' } });
    }

    if (toBool(sinEmpaques)) {
      AND.push({ NOT: { tipo: { equals: 'EMPAQUE', mode: 'insensitive' } } });
      // Si prefieres exacto sin mode: AND.push({ NOT: { tipo: 'EMPAQUE' } });
    }

    if (q?.trim()) {
      where.OR = [
        { nombre: { contains: q.trim(), mode: 'insensitive' } },
        { tipo: { contains: q.trim(), mode: 'insensitive' } },
        { unidad_medida: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    if (AND.length) where.AND = AND;

    const items = await prisma.materias_primas.findMany({
      where,
      orderBy: { id: 'desc' },
    });

    res.json(items);
  } catch (err) {
    console.error('listarMateriasPrimas error:', err);
    res.status(500).json({ message: 'Error al listar materias primas' });
  }
}

/* ========== Obtener por ID ========== */
async function obtenerMateriaPrima(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const materia = await prisma.materias_primas.findUnique({ where: { id } });
    if (!materia) return res.status(404).json({ message: 'Materia prima no encontrada' });

    res.json(materia);
  } catch (err) {
    console.error('obtenerMateriaPrima error:', err);
    res.status(500).json({ message: 'Error al obtener la materia prima' });
  }
}

/* ========== Obtener stock ========== */
async function obtenerStock(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const materia = await prisma.materias_primas.findUnique({
      where: { id },
      select: { id: true, nombre: true, stock_total: true },
    });

    if (!materia) return res.status(404).json({ message: 'Materia prima no encontrada' });

    res.json(materia);
  } catch (err) {
    console.error('obtenerStock error:', err);
    res.status(500).json({ message: 'Error al obtener stock' });
  }
}

/* ========== Actualizar ========== */
async function actualizarMateriaPrima(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const { nombre, tipo, unidad_medida, estado } = req.body;
    const existe = await prisma.materias_primas.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ message: 'Materia prima no encontrada' });

    if (typeof nombre === 'string' && nombre.trim().toLowerCase() !== existe.nombre.toLowerCase()) {
      const dup = await prisma.materias_primas.findFirst({
        where: {
          nombre: { equals: nombre.trim(), mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (dup)
        return res.status(409).json({ message: 'Ya existe otra materia prima con ese nombre' });
    }

    const updated = await prisma.materias_primas.update({
      where: { id },
      data: {
        ...(typeof nombre === 'string' ? { nombre: nombre.trim() } : {}),
        ...(typeof tipo === 'string' ? { tipo: tipo.trim() } : {}),
        ...(typeof unidad_medida === 'string' ? { unidad_medida: unidad_medida.trim() } : {}),
        ...(typeof estado === 'boolean' ? { estado } : {}),
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('actualizarMateriaPrima error:', err);
    res.status(500).json({ message: 'Error al actualizar materia prima' });
  }
}

/* ========== Cambiar estado ========== */
async function cambiarEstadoMateriaPrima(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const materia = await prisma.materias_primas.findUnique({ where: { id } });
    if (!materia) return res.status(404).json({ message: 'Materia prima no encontrada' });

    const nuevoEstado = typeof req.body.estado === 'boolean' ? req.body.estado : !materia.estado;

    const updated = await prisma.materias_primas.update({
      where: { id },
      data: { estado: nuevoEstado },
    });

    res.json({ message: 'Estado actualizado', materia: updated });
  } catch (err) {
    console.error('cambiarEstadoMateriaPrima error:', err);
    res.status(500).json({ message: 'Error al cambiar estado' });
  }
}

/* ========== Eliminar ========== */
/**
 * - ?hard=true  -> borrado definitivo (valida dependencias)
 * - por defecto -> soft delete (estado=false)
 */
async function eliminarMateriaPrima(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const { hard } = req.query;
    const materia = await prisma.materias_primas.findUnique({ where: { id } });
    if (!materia) return res.status(404).json({ message: 'Materia prima no encontrada' });

    if (String(hard).toLowerCase() === 'true') {
      const tieneLotes = await prisma.lotes_materia_prima.findFirst({
        where: { materia_prima_id: id },
      });
      if (tieneLotes)
        return res.status(409).json({ message: 'No se puede eliminar: tiene lotes asociados.' });

      const enRecetas = await prisma.ingredientes_receta.findFirst({
        where: { materia_prima_id: id },
      });
      if (enRecetas)
        return res
          .status(409)
          .json({ message: 'No se puede eliminar: está siendo usada en recetas.' });

      const tieneMovs = await prisma.movimientos_materia_prima.findFirst({
        where: { materia_prima_id: id },
      });
      if (tieneMovs)
        return res
          .status(409)
          .json({ message: 'No se puede eliminar: existen movimientos de inventario asociados.' });

      const tieneTraza = await prisma.trazabilidad_produccion.findFirst({
        where: { materia_prima_id: id },
      });
      if (tieneTraza)
        return res
          .status(409)
          .json({ message: 'No se puede eliminar: existe trazabilidad de producción asociada.' });

      await prisma.materias_primas.delete({ where: { id } });
      return res.status(204).send();
    }

    const updated = await prisma.materias_primas.update({ where: { id }, data: { estado: false } });
    return res.json({ message: 'Materia prima desactivada', materia: updated });
  } catch (err) {
    console.error('eliminarMateriaPrima error:', err);
    res.status(500).json({ message: 'Error al eliminar materia prima' });
  }
}

/* ========== Exports explícitos ========== */
module.exports = {
  crearMateriaPrima,
  listarMateriasPrimas,
  obtenerMateriaPrima,
  obtenerStock,
  actualizarMateriaPrima,
  cambiarEstadoMateriaPrima,
  eliminarMateriaPrima,
};
