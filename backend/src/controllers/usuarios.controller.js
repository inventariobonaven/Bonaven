// src/controllers/usuarios.controller.js
const bcrypt = require('bcrypt');
const prisma = require('../database/prismaClient');

// Crear nuevo usuario (ADMIN)
exports.createUser = async (req, res) => {
  try {
    const { nombre, usuario, contrasena, rol, estado } = req.body;

    if (!nombre || !usuario || !contrasena || !rol) {
      return res.status(400).json({ message: 'nombre, usuario, contrasena y rol son obligatorios' });
    }

    const existe = await prisma.usuarios.findUnique({ where: { usuario } });
    if (existe) return res.status(409).json({ message: 'El usuario ya existe' });

    const hashed = await bcrypt.hash(contrasena, 10);

    const nuevo = await prisma.usuarios.create({
      data: {
        nombre,
        usuario,
        contrasena: hashed,
        rol,                    // Debe ser 'ADMIN' o 'PRODUCCION' (enum)
        estado: estado ?? true,
      },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true }
    });

    res.status(201).json({ message: 'Usuario creado', usuario: nuevo });
  } catch (error) {
    console.error('createUser error:', error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
};

// Listar usuarios (ADMIN)
exports.listUsers = async (req, res) => {
  try {
    const users = await prisma.usuarios.findMany({
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true }
    });
    res.json(users);
  } catch (error) {
    console.error('listUsers error:', error);
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
};

// Obtener por ID (ADMIN)
exports.getUserById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await prisma.usuarios.findUnique({
      where: { id },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true }
    });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    console.error('getUserById error:', error);
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
};

// Actualizar usuario (ADMIN)
exports.updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, usuario, rol, estado } = req.body;

    const existe = await prisma.usuarios.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ message: 'Usuario no encontrado' });

    // validar duplicado de username
    if (usuario && usuario !== existe.usuario) {
      const dup = await prisma.usuarios.findUnique({ where: { usuario } });
      if (dup) return res.status(409).json({ message: 'Ese usuario ya existe' });
    }

    const updated = await prisma.usuarios.update({
      where: { id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        ...(usuario !== undefined ? { usuario } : {}),
        ...(rol !== undefined ? { rol } : {}),
        ...(estado !== undefined ? { estado } : {}),
      },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true }
    });

    res.json({ message: 'Usuario actualizado', usuario: updated });
  } catch (error) {
    console.error('updateUser error:', error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};

// Cambiar contraseña (ADMIN)
exports.changePassword = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { contrasena } = req.body;
    if (!contrasena) return res.status(400).json({ message: 'Nueva contraseña requerida' });

    const hashed = await bcrypt.hash(contrasena, 10);
    await prisma.usuarios.update({ where: { id }, data: { contrasena: hashed } });
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    console.error('changePassword error:', error);
    res.status(500).json({ message: 'Error al actualizar contraseña' });
  }
};

// Cambiar estado (toggle) (ADMIN)
exports.changeUserState = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await prisma.usuarios.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const updated = await prisma.usuarios.update({
      where: { id },
      data: { estado: !user.estado },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true }
    });

    res.json({ message: 'Estado actualizado', usuario: updated });
  } catch (error) {
    console.error('changeUserState error:', error);
    res.status(500).json({ message: 'Error al cambiar estado' });
  }
};

// Eliminar usuario (ADMIN) - hard delete
exports.deleteUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.usuarios.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('deleteUser error:', error);
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
};



