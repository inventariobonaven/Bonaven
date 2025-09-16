const jwt = require('jsonwebtoken');
const prisma = require('../database/prismaClient');
require('dotenv').config();

/** Normaliza: mayúsculas y sin acentos */
function normalizeRole(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/** Permisos por rol (ajústalo si necesitas más finos) */
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
      'PRODUCCION_VIEW',
      'PRODUCCION_CALCULAR',
      'PRODUCCION_REGISTRAR_PRODUCTO_TERMINADO',
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

    const rolNorm = normalizeRole(user.rol);
    const permissions = getPermissionsByRole(user.rol);

    req.user = { ...user, rolNorm };
    req.permissions = permissions;

    // Log útil en prod (apaga si quieres)
    console.log(
      `[AUTH] uid=${user.id} rol="${user.rol}" → rolNorm=${rolNorm} perms=[${permissions.join(',')}]`,
    );

    next();
  } catch (err) {
    console.error('authenticateToken error', err);
    res.status(500).json({ message: 'Error de servidor' });
  }
}

/** Autorización por roles */
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

/** Autorización por permisos */
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

/* Aliases convenientes */
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
