-- CreateEnum
CREATE TYPE "TipoMovimientoPT" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- AlterTable
ALTER TABLE "productos_terminados" ADD COLUMN     "stock_total" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_producto_terminado" ADD COLUMN     "lote_id" INTEGER,
ADD COLUMN     "tipo" "TipoMovimientoPT" NOT NULL DEFAULT 'ENTRADA';

-- CreateTable
CREATE TABLE "lotes_producto_terminado" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "presentacion_id" INTEGER,
    "codigo" VARCHAR(64) NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "fecha_ingreso" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "estado" "EstadoLote" NOT NULL DEFAULT 'DISPONIBLE',

    CONSTRAINT "lotes_producto_terminado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_producto_terminado_producto_id_estado_idx" ON "lotes_producto_terminado"("producto_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_producto_terminado_producto_id_codigo_key" ON "lotes_producto_terminado"("producto_id", "codigo");

-- CreateIndex
CREATE INDEX "stock_producto_terminado_producto_id_fecha_idx" ON "stock_producto_terminado"("producto_id", "fecha");

-- CreateIndex
CREATE INDEX "stock_producto_terminado_lote_id_fecha_idx" ON "stock_producto_terminado"("lote_id", "fecha");

-- AddForeignKey
ALTER TABLE "lotes_producto_terminado" ADD CONSTRAINT "lotes_producto_terminado_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_producto_terminado" ADD CONSTRAINT "lotes_producto_terminado_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_producto_terminado" ADD CONSTRAINT "stock_producto_terminado_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_producto_terminado"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
