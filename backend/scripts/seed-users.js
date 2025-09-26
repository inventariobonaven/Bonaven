// scripts/seed-users.js
const bcrypt = require('bcrypt');
const prisma = require('../src/database/prismaClient');

async function main() {
  // Contraseñas iniciales
  const adminPassword = 'Admin123';
  const produccionPassword = 'Produccion123';

  const hashedAdmin = await bcrypt.hash(adminPassword, 10);
  const hashedProd = await bcrypt.hash(produccionPassword, 10);

  // Crear admin si no existe
  const adminExists = await prisma.usuarios.findUnique({ where: { usuario: 'admin' } });
  if (!adminExists) {
    const admin = await prisma.usuarios.create({
      data: {
        usuario: 'admin',
        nombre: 'Administrador General',
        contrasena: hashedAdmin,
        rol: 'ADMIN',
        estado: true,
      },
    });
    console.log('Admin creado -> usuario: admin, password:', adminPassword);
  } else {
    console.log('Admin ya existe:', adminExists.usuario);
  }

  // Crear usuario de produccion si no existe
  const prodExists = await prisma.usuarios.findUnique({ where: { usuario: 'produccion' } });
  if (!prodExists) {
    const prod = await prisma.usuarios.create({
      data: {
        usuario: 'produccion',
        nombre: 'Usuario Producción',
        contrasena: hashedProd,
        rol: 'PRODUCCION',
        estado: true,
      },
    });
    console.log('Producción creado -> usuario: produccion, password:', produccionPassword);
  } else {
    console.log('Usuario produccion ya existe:', prodExists.usuario);
  }
}

main()
  .then(() => {
    console.log('Seed completado');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
