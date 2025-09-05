// src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../database/prismaClient');
require('dotenv').config();

/** Mapeo de permisos por rol */
function getPermissionsByRole(role) {
  const r = role && role.toString().toUpperCase();
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
  return map[r] || [];
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

    // Acepta distintas formas de payload
    const pid = payload?.userId ?? payload?.id ?? payload?.user?.id;
    if (!pid) return res.status(401).json({ message: 'Token sin identificador de usuario' });

    // Traer usuario “fresco” desde DB (estado/rol actuales)
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

    req.user = user;
    req.permissions = getPermissionsByRole(user.rol);
    next();
  } catch (err) {
    console.error('authenticateToken error', err);
    res.status(500).json({ message: 'Error de servidor' });
  }
}

/** Autorización por roles. Uso: requireRole('ADMIN', 'PRODUCCION') */
function authorizeRoles(...allowedRoles) {
  const allow = allowedRoles.map(r => String(r).toUpperCase());
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    const userRole = String(req.user.rol).toUpperCase();
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
    const missing = required.filter(p => !req.permissions.includes(p));
    if (missing.length) {
      return res.status(403).json({ message: 'No autorizado (permiso)' });
    }
    next();
  };
}

/* ====== Aliases para compatibilidad con rutas existentes ====== */
// Nombre corto usado en rutas: requireAuth
const requireAuth = authenticateToken;
// Nombre corto usado en rutas: requireRole
const requireRole = (...roles) => authorizeRoles(...roles);
const requireRoleAdmin = authorizeRoles('ADMIN');

module.exports = {
  // nombres originales
  authenticateToken,
  authorizeRoles,
  authorizePermissions,
  getPermissionsByRole,
  // aliases compatibles
  requireAuth,
  requireRole,
  requireRoleAdmin,
  // default export (útil si haces `const auth = require(...)`)
  default: authenticateToken,
};



