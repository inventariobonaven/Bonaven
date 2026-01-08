-- AlterTable
ALTER TABLE "public"."productos_terminados" ADD COLUMN     "codigo_barras" VARCHAR(64);

-- CreateIndex
CREATE INDEX "productos_terminados_codigo_barras_idx" ON "public"."productos_terminados"("codigo_barras");
