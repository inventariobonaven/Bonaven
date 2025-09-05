/*
  Warnings:

  - You are about to alter the column `cantidad` on the `detalles_venta` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(18,3)`.
  - You are about to alter the column `cantidad` on the `ingredientes_receta` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(18,3)`.
  - You are about to alter the column `cantidad` on the `lotes_materia_prima` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(18,3)`.
  - You are about to alter the column `cantidad_producida` on the `producciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(18,3)`.
  - You are about to alter the column `cantidad` on the `stock_producto_terminado` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(18,3)`.

*/
-- AlterTable
ALTER TABLE "detalles_venta" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "ingredientes_receta" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "lotes_materia_prima" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "materias_primas" ALTER COLUMN "stock_total" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "producciones" ALTER COLUMN "cantidad_producida" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "stock_producto_terminado" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(18,3);
