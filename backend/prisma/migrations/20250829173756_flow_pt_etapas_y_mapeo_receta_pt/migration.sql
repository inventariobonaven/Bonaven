-- CreateEnum
CREATE TYPE "EtapaPT" AS ENUM ('CONGELADO', 'EMPAQUE', 'HORNEO');

-- CreateEnum
CREATE TYPE "VencimientoBase" AS ENUM ('PRODUCCION', 'EMPAQUE', 'HORNEO');

-- AlterTable
ALTER TABLE "lotes_producto_terminado" ADD COLUMN     "etapa" "EtapaPT" NOT NULL DEFAULT 'EMPAQUE';

-- AlterTable
ALTER TABLE "productos_terminados" ADD COLUMN     "requiere_congelacion_previa" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "receta_producto_map" (
    "id" SERIAL NOT NULL,
    "receta_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "unidades_por_batch" INTEGER NOT NULL,
    "vida_util_dias" INTEGER NOT NULL,
    "vencimiento_base" "VencimientoBase" NOT NULL,

    CONSTRAINT "receta_producto_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receta_producto_map_producto_id_idx" ON "receta_producto_map"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "receta_producto_map_receta_id_producto_id_key" ON "receta_producto_map"("receta_id", "producto_id");

-- CreateIndex
CREATE INDEX "lotes_producto_terminado_producto_id_estado_etapa_fecha_ing_idx" ON "lotes_producto_terminado"("producto_id", "estado", "etapa", "fecha_ingreso");

-- CreateIndex
CREATE INDEX "idx_pt_codigo" ON "lotes_producto_terminado"("codigo");

-- CreateIndex
CREATE INDEX "stock_producto_terminado_tipo_fecha_idx" ON "stock_producto_terminado"("tipo", "fecha");

-- AddForeignKey
ALTER TABLE "receta_producto_map" ADD CONSTRAINT "receta_producto_map_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_producto_map" ADD CONSTRAINT "receta_producto_map_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
