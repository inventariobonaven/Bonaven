/*
  Warnings:

  - You are about to drop the column `presentacion_id` on the `lotes_producto_terminado` table. All the data in the column will be lost.
  - You are about to drop the column `cantidad` on the `presentaciones` table. All the data in the column will be lost.
  - You are about to drop the column `unidad_medida` on the `presentaciones` table. All the data in the column will be lost.
  - You are about to drop the column `presentacion_id` on the `recetas` table. All the data in the column will be lost.
  - You are about to drop the column `presentacion_id` on the `stock_producto_terminado` table. All the data in the column will be lost.
  - You are about to drop the `empaques_por_presentacion` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `producto_id` on table `presentaciones` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "empaques_por_presentacion" DROP CONSTRAINT "empaques_por_presentacion_empaque_id_fkey";

-- DropForeignKey
ALTER TABLE "empaques_por_presentacion" DROP CONSTRAINT "empaques_por_presentacion_presentacion_id_fkey";

-- DropForeignKey
ALTER TABLE "lotes_producto_terminado" DROP CONSTRAINT "lotes_producto_terminado_presentacion_id_fkey";

-- DropForeignKey
ALTER TABLE "presentaciones" DROP CONSTRAINT "presentaciones_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "recetas" DROP CONSTRAINT "recetas_presentacion_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_producto_terminado" DROP CONSTRAINT "stock_producto_terminado_presentacion_id_fkey";

-- AlterTable
ALTER TABLE "lotes_producto_terminado" DROP COLUMN "presentacion_id";

-- AlterTable
ALTER TABLE "presentaciones" DROP COLUMN "cantidad",
DROP COLUMN "unidad_medida",
ADD COLUMN     "descripcion_display" TEXT,
ADD COLUMN     "unidad_interna" VARCHAR(8),
ADD COLUMN     "unidades_internas_por_empaque" INTEGER,
ALTER COLUMN "producto_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "recetas" DROP COLUMN "presentacion_id";

-- AlterTable
ALTER TABLE "stock_producto_terminado" DROP COLUMN "presentacion_id",
ADD COLUMN     "motivo" TEXT,
ADD COLUMN     "ref_id" INTEGER,
ADD COLUMN     "ref_tipo" TEXT,
ADD COLUMN     "usuario_id" INTEGER;

-- DropTable
DROP TABLE "empaques_por_presentacion";

-- CreateIndex
CREATE INDEX "idx_pt_fifo" ON "lotes_producto_terminado"("producto_id", "estado", "fecha_vencimiento", "fecha_ingreso");

-- AddForeignKey
ALTER TABLE "stock_producto_terminado" ADD CONSTRAINT "stock_producto_terminado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "presentaciones" ADD CONSTRAINT "presentaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
