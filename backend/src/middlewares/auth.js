// src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../database/prismaClient');

/* ============ Helpers ============ */
const norm = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

function getPermissionsByRole(role) {
  const R = norm(role);
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

function pickToken(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) return null;
  return h.startsWith('Bearer ') ? h.slice(7).trim() : String(h).trim();
}

/* ============ Auth ============ */
async function authenticateToken(req, res, next) {
  try {
    const token = pickToken(req);
    if (!token) return res.status(401).json({ message: 'Token requerido' });
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Configuración faltante: JWT_SECRET' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    const pid = Number(payload?.userId ?? payload?.id ?? payload?.user?.id);
    if (!pid) return res.status(401).json({ message: 'Token sin identificador de usuario' });

    const user = await prisma.usuarios.findUnique({
      where: { id: pid },
      select: { id: true, usuario: true, nombre: true, rol: true, estado: true },
    });
    if (!user) return res.status(401).json({ message: 'Usuario no encontrado' });
    if (user.estado === false) return res.status(403).json({ message: 'Usuario inactivo' });

    req.user = { ...user, rolNorm: norm(user.rol) };
    req.permissions = getPermissionsByRole(user.rol);
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Error de servidor' });
  }
}

/* ============ Autorización ============ */
function authorizeRoles(...roles) {
  const allow = roles.map(norm);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (!allow.includes(norm(req.user.rol))) {
      return res.status(403).json({ message: 'No autorizado (rol)' });
    }
    return next();
  };
}

function authorizePermissions(...required) {
  const must = [...new Set(required)];
  return (req, res, next) => {
    if (!req.permissions) return res.status(401).json({ message: 'No autenticado' });
    const missing = must.filter((p) => !req.permissions.includes(p));
    if (missing.length) return res.status(403).json({ message: 'No autorizado (permiso)' });
    return next();
  };
}

/* ============ Exports ============ */
module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizePermissions,
  getPermissionsByRole,
  requireAuth: authenticateToken,
  requireRole: (...roles) => authorizeRoles(...roles),
  requireRoleAdmin: authorizeRoles('ADMIN'),
};
