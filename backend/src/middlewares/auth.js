// src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../database/prismaClient');
require('dotenv').config();

/* -------- helpers -------- */
function normalizeRole(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function getPermissionsByRole(role) {
  const R = normalizeRole(role);
  const map = {
    ADMIN: [
      'USUARIOS_MANAGE',
      'PROVEEDORES_MANAGE',
      'MATERIAS_MANAGE',
      'RECETAS_MANAGE',
      'PRODUCCION_MANAGE',
      'VENTAS_MANAGE',
      'PRODUCCION_VIEW',
    ],
    PRODUCCION: [
      'PRODUCCION_VIEW',
      'PRODUCCION_CALCULAR',
      'PRODUCCION_REGISTRAR_PRODUCTO_TERMINADO',
    ],
  };
  return map[R] || [];
}

/* --- auth --- */
async function authenticateToken(req, res, next) {
  try {
    const header = req.headers['authorization'] || req.headers['Authorization'];
    if (!header) return res.status(401).json({ message: 'Token requerido' });

    const token = header.startsWith('Bearer ') ? header.slice(7) : header;

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    const pid = payload?.userId ?? payload?.id ?? payload?.user?.id;
    if (!pid) return res.status(401).json({ message: 'Token sin identificador de usuario' });

    const user = await prisma.usuarios.findUnique({
      where: { id: Number(pid) },
      select: { id: true, usuario: true, nombre: true, rol: true, estado: true },
    });
    if (!user) return res.status(401).json({ message: 'Usuario no encontrado' });
    if (user.estado === false) {
      return res.status(403).json({ message: 'Usuario inactivo. Contacte al administrador.' });
    }

    req.user = { ...user, rolNorm: normalizeRole(user.rol) };
    req.permissions = getPermissionsByRole(user.rol);
    next();
  } catch (err) {
    console.error('authenticateToken error', err);
    res.status(500).json({ message: 'Error de servidor' });
  }
}

function authorizeRoles(...allowed) {
  const allow = allowed.map(normalizeRole);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    const role = normalizeRole(req.user.rol);
    if (!allow.includes(role)) return res.status(403).json({ message: 'No autorizado (rol)' });
    next();
  };
}

function authorizePermissions(...required) {
  return (req, res, next) => {
    if (!req.permissions) return res.status(401).json({ message: 'No autenticado' });
    const missing = required.filter((p) => !req.permissions.includes(p));
    if (missing.length) return res.status(403).json({ message: 'No autorizado (permiso)' });
    next();
  };
}

const requireAuth = authenticateToken;
const requireRole = (...roles) => authorizeRoles(...roles);
const requireRoleAdmin = authorizeRoles('ADMIN');

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizePermissions,
  getPermissionsByRole,
  requireAuth,
  requireRole,
  requireRoleAdmin,
  default: authenticateToken,
};
