const { Router } = require('express');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const ctrl = require('../controllers/notificaciones.controller');

const router = Router();

router.use(authenticateToken);
router.get('/', authorizeRoles('ADMIN'), ctrl.list);
router.patch('/:id/read', authorizeRoles('ADMIN'), ctrl.markRead);
router.post('/mark-all-read', authorizeRoles('ADMIN'), ctrl.markAllRead);

module.exports = router;
