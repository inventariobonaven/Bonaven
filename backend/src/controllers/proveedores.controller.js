const prisma = require('../database/prismaClient');

function handleDbError(res, err, contextMessage) {
  console.error(`${contextMessage}:`, err.code || err.message);
  if (err.code === 'P1001') {
    return res.status(503).json({ message: 'Servicio de base de datos no disponible' });
  }
  return res.status(500).json({ message: 'Error interno del servidor' });
}

exports.crearProveedor = async (req, res) => {
  try {
    const { nombre, contacto, estado } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    const existe = await prisma.proveedores.findFirst({
      where: { nombre: nombre.trim() }
    });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe un proveedor con ese nombre' });
    }

    const nuevo = await prisma.proveedores.create({
      data: {
        nombre: nombre.trim(),
        contacto: contacto ?? null,
        estado: typeof estado === 'boolean' ? estado : true
      }
    });

    res.status(201).json(nuevo);
  } catch (err) {
    handleDbError(res, err, 'crearProveedor error');
  }
};

exports.listarProveedores = async (req, res) => {
  try {
    const { estado, q } = req.query;
    const where = {};

    if (estado === 'true') where.estado = true;
    if (estado === 'false') where.estado = false;

    if (q && q.trim()) {
      where.OR = [
        { nombre: { contains: q.trim(), mode: 'insensitive' } },
        { contacto: { contains: q.trim(), mode: 'insensitive' } }
      ];
    }

    const proveedores = await prisma.proveedores.findMany({
      where,
      orderBy: { id: 'desc' }
    });

    res.json(proveedores);
  } catch (err) {
    handleDbError(res, err, 'listarProveedores error');
  }
};

exports.obtenerProveedor = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const proveedor = await prisma.proveedores.findUnique({ where: { id } });
    if (!proveedor) return res.status(404).json({ message: 'Proveedor no encontrado' });

    res.json(proveedor);
  } catch (err) {
    handleDbError(res, err, 'obtenerProveedor error');
  }
};

exports.actualizarProveedor = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const { nombre, contacto, estado } = req.body;
    const existe = await prisma.proveedores.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ message: 'Proveedor no encontrado' });

    const updated = await prisma.proveedores.update({
      where: { id },
      data: {
        ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
        ...(contacto !== undefined ? { contacto } : {}),
        ...(typeof estado === 'boolean' ? { estado } : {})
      }
    });

    res.json(updated);
  } catch (err) {
    handleDbError(res, err, 'actualizarProveedor error');
  }
};

exports.cambiarEstadoProveedor = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const proveedor = await prisma.proveedores.findUnique({ where: { id } });
    if (!proveedor) return res.status(404).json({ message: 'Proveedor no encontrado' });

    let nuevoEstado;
    if (typeof req.body.estado === 'boolean') {
      nuevoEstado = req.body.estado;
    } else {
      nuevoEstado = !Boolean(proveedor.estado);
    }

    const updated = await prisma.proveedores.update({
      where: { id },
      data: { estado: nuevoEstado }
    });

    res.json({ message: 'Estado actualizado', proveedor: updated });
  } catch (err) {
    handleDbError(res, err, 'cambiarEstadoProveedor error');
  }
};

exports.eliminarProveedor = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const { hard } = req.query;
    const proveedor = await prisma.proveedores.findUnique({ where: { id } });
    if (!proveedor) return res.status(404).json({ message: 'Proveedor no encontrado' });

    if (hard === 'true') {
      await prisma.proveedores.delete({ where: { id } });
      return res.status(204).send();
    } else {
      const updated = await prisma.proveedores.update({
        where: { id },
        data: { estado: false }
      });
      return res.json({ message: 'Proveedor desactivado', proveedor: updated });
    }
  } catch (err) {
    handleDbError(res, err, 'eliminarProveedor error');
  }
};


