// backend/src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../database/prismaClient');
require('dotenv').config();

/** Normaliza rol: mayúsculas + sin acentos */
function normalizeRole(v) {
  return String(v || '')
    .normalize('NFD') // separa acentos
    .replace(/[\u0300-\u036f]/g, '') // quita marcas diacríticas
    .toUpperCase()
    .trim();
}

/** Mapeo de permisos por rol (claves normalizadas) */
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
    ],
    PRODUCCION: [
      'PRODUCCION_CALCULAR',
      'PRODUCCION_REGISTRAR_PRODUCTO_TERMINADO',
      'PRODUCCION_VIEW',
    ],
  };
  return map[R] || [];
}

/** Autenticación: valida JWT y carga req.user + req.permissions */
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

    let user;
    try {
      user = await prisma.usuarios.findUnique({
        where: { id: Number(pid) },
        select: { id: true, usuario: true, nombre: true, rol: true, estado: true },
      });
    } catch (dbErr) {
      console.error('Error de conexión a BD:', dbErr.code || dbErr.message);
      return res.status(503).json({ message: 'BD no disponible. Intenta más tarde.' });
    }

    if (!user) return res.status(401).json({ message: 'Usuario no encontrado' });
    if (user.estado === false) {
      return res.status(403).json({ message: 'Usuario inactivo. Contacte al administrador.' });
    }

    // Adjunta rol normalizado (útil para logs o futuras decisiones)
    req.user = { ...user, rolNorm: normalizeRole(user.rol) };
    req.permissions = getPermissionsByRole(user.rol);
    next();
  } catch (err) {
    console.error('authenticateToken error', err);
    res.status(500).json({ message: 'Error de servidor' });
  }
}

/** Autorización por roles. Uso: authorizeRoles('ADMIN','PRODUCCION') */
function authorizeRoles(...allowedRoles) {
  const allow = allowedRoles.map(normalizeRole);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    const userRole = normalizeRole(req.user.rol);
    if (!allow.includes(userRole)) {
      return res.status(403).json({ message: 'No autorizado (rol)' });
    }
    next();
  };
}

/** Autorización por permisos finos */
function authorizePermissions(...required) {
  return (req, res, next) => {
    if (!req.permissions) return res.status(401).json({ message: 'No autenticado' });
    const missing = required.filter((p) => !req.permissions.includes(p));
    if (missing.length) {
      return res.status(403).json({ message: 'No autorizado (permiso)' });
    }
    next();
  };
}

/* Aliases */
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
