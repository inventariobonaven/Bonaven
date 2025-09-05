/*
  Warnings:

  - The `estado` column on the `lotes_materia_prima` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "EstadoLote" AS ENUM ('DISPONIBLE', 'RESERVADO', 'AGOTADO', 'VENCIDO', 'INACTIVO');

-- DropForeignKey
ALTER TABLE "lotes_materia_prima" DROP CONSTRAINT "lotes_materia_prima_materia_prima_id_fkey";

-- DropForeignKey
ALTER TABLE "lotes_materia_prima" DROP CONSTRAINT "lotes_materia_prima_proveedor_id_fkey";

-- AlterTable
ALTER TABLE "lotes_materia_prima" DROP COLUMN "estado",
ADD COLUMN     "estado" "EstadoLote" NOT NULL DEFAULT 'DISPONIBLE';

-- CreateIndex
CREATE INDEX "lotes_materia_prima_materia_prima_id_fecha_ingreso_idx" ON "lotes_materia_prima"("materia_prima_id", "fecha_ingreso");

-- CreateIndex
CREATE INDEX "lotes_materia_prima_materia_prima_id_estado_idx" ON "lotes_materia_prima"("materia_prima_id", "estado");

-- CreateIndex
CREATE INDEX "materias_primas_nombre_idx" ON "materias_primas"("nombre");

-- AddForeignKey
ALTER TABLE "lotes_materia_prima" ADD CONSTRAINT "lotes_materia_prima_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_materia_prima" ADD CONSTRAINT "lotes_materia_prima_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
