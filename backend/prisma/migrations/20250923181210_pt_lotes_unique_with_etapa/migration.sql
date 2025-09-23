/*
  Warnings:

  - A unique constraint covering the columns `[producto_id,codigo,etapa]` on the table `lotes_producto_terminado` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."lotes_producto_terminado_producto_id_codigo_key";

-- AlterTable
ALTER TABLE "public"."lotes_producto_terminado" ALTER COLUMN "fecha_ingreso" SET DATA TYPE DATE,
ALTER COLUMN "fecha_vencimiento" SET DATA TYPE DATE;

-- CreateIndex
CREATE UNIQUE INDEX "lotes_producto_terminado_producto_id_codigo_etapa_key" ON "public"."lotes_producto_terminado"("producto_id", "codigo", "etapa");
