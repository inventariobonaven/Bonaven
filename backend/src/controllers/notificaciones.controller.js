const prisma = require('../database/prismaClient');

// GET /notificaciones?unreadOnly=true&tipo=OBS_PRODUCCION&limit=20
exports.list = async (req, res) => {
  const { unreadOnly = 'true', tipo, limit = '20' } = req.query;

  const where = {
    target_rol: 'ADMIN',
    ...(tipo ? { tipo } : {}),
    ...(unreadOnly === 'true' ? { leida: false } : {}),
  };

  const items = await prisma.notificaciones.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: Number(limit) || 20,
  });

  res.json(items);
};

// PATCH /notificaciones/:id/read
exports.markRead = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'id inválido' });

  await prisma.notificaciones.update({
    where: { id },
    data: { leida: true },
  });
  res.status(204).end();
};

// POST /notificaciones/mark-all-read
exports.markAllRead = async (_req, res) => {
  await prisma.notificaciones.updateMany({
    where: { target_rol: 'ADMIN', leida: false },
    data: { leida: true },
  });
  res.status(204).end();
};
