// src/controllers/auth.controller.js
const prisma = require('../database/prismaClient');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getPermissionsByRole } = require('../middlewares/auth'); // importante
require('dotenv').config();

exports.login = async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    if (!usuario || !contrasena) {
      return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
    }

    // Buscar usuario
    const user = await prisma.usuarios.findUnique({ where: { usuario } });
    if (!user) {
      return res.status(401).json({ message: 'Usuario o contraseña inválidos' });
    }

    // Validar estado
    if (user.estado === false) {
      return res.status(403).json({ message: 'Usuario inactivo, contacte al administrador' });
    }

    // Verificar contraseña
    const match = await bcrypt.compare(contrasena, user.contrasena);
    if (!match) {
      return res.status(401).json({ message: 'Usuario o contraseña inválidos' });
    }

    // Verificar si existe la clave JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET no está definida en el archivo .env');
      return res.status(500).json({ message: 'Error de configuración del servidor: falta JWT_SECRET' });
    }

    // Crear token con id y rol
    const token = jwt.sign(
      { userId: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Calcular permisos
    const permissions = getPermissionsByRole(user.rol);

    // No enviar la contraseña
    const { contrasena: _, ...userSafe } = user;

    res.json({
      token,
      user: userSafe,
      permissions
    });
  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// Endpoint para devolver info del usuario autenticado
exports.me = async (req, res) => {
  try {
    const { contrasena, ...userSafe } = req.user;
    res.json({
      user: userSafe,
      permissions: req.permissions
    });
  } catch (err) {
    console.error('❌ Error en /me:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};



