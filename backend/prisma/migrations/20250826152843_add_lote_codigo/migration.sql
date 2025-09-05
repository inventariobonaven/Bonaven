/*
  Warnings:

  - A unique constraint covering the columns `[materia_prima_id,codigo]` on the table `lotes_materia_prima` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "lotes_materia_prima" ADD COLUMN     "codigo" VARCHAR(64);

-- CreateIndex
CREATE INDEX "idx_lote_codigo" ON "lotes_materia_prima"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_materia_prima_materia_prima_id_codigo_key" ON "lotes_materia_prima"("materia_prima_id", "codigo");
