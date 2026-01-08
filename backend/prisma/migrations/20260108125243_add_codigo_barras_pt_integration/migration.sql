/*
  Warnings:

  - A unique constraint covering the columns `[codigo_barras]` on the table `productos_terminados` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."productos_terminados_codigo_barras_idx";

-- CreateIndex
CREATE UNIQUE INDEX "productos_terminados_codigo_barras_key" ON "public"."productos_terminados"("codigo_barras");
