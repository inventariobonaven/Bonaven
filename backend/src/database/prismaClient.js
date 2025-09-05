// src/database/prismaClient.js
// 👇 OJO: mantenemos tu import desde '../generated/prisma'
const { PrismaClient } = require('../generated/prisma');

// Evita crear múltiples PrismaClient en desarrollo (hot-reload)
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: ['warn', 'error'], // opcional: ayuda a detectar problemas
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

// Cerrar conexiones limpiamente cuando el proceso termina (opcional)
process.on('beforeExit', async () => {
  try { await prisma.$disconnect(); } catch {}
});

module.exports = prisma;