// backend/src/routes/materiasPrimas.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/materiasPrimas.controller');
const { authenticateToken } = require('../middlewares/auth');

/* Normaliza rol: sin acentos, mayúsculas */
const norm = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

/* Sets de autorización */
const READ_ROLES = new Set(['ADMIN', 'PRODUCCION']);
const READ_PERMS = new Set(['PRODUCCION_VIEW', 'MATERIAS_MANAGE']);

/* --- Guards --- */
function allowAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'No autenticado' });
  if (norm(req.user.rol) === 'ADMIN') return next();
  return res.status(403).json({ message: 'No autorizado (se requiere ADMIN)' });
}

function allowRead(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'No autenticado' });

  const roleOk = READ_ROLES.has(norm(req.user.rol));
  const perms = Array.isArray(req.permissions) ? req.permissions : [];
  const permOk = perms.some((p) => READ_PERMS.has(p));

  if (roleOk || permOk) return next();
  return res.status(403).json({ message: 'No autorizado (rol/permiso)' });
}

/* ===== CRUD ===== */

// Crear (solo ADMIN)
router.post('/', authenticateToken, allowAdmin, ctrl.crearMateriaPrima);

// Listar (ADMIN o PRODUCCION, o permisos finos)
router.get('/', authenticateToken, allowRead, ctrl.listarMateriasPrimas);

// Obtener (ADMIN o PRODUCCION, o permisos finos)
router.get('/:id', authenticateToken, allowRead, ctrl.obtenerMateriaPrima);

// Actualizar (solo ADMIN)
router.put('/:id', authenticateToken, allowAdmin, ctrl.actualizarMateriaPrima);

// Cambiar estado (solo ADMIN)
router.patch('/:id/estado', authenticateToken, allowAdmin, ctrl.cambiarEstadoMateriaPrima);

// Eliminar (solo ADMIN)
router.delete('/:id', authenticateToken, allowAdmin, ctrl.eliminarMateriaPrima);

module.exports = router;
