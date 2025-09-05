-- CreateEnum
CREATE TYPE "TipoMovimientoMP" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- CreateTable
CREATE TABLE "movimientos_materia_prima" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMovimientoMP" NOT NULL,
    "materia_prima_id" INTEGER NOT NULL,
    "lote_id" INTEGER,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "motivo" TEXT,
    "ref_tipo" TEXT,
    "ref_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_materia_prima_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_materia_prima_materia_prima_id_fecha_idx" ON "movimientos_materia_prima"("materia_prima_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_materia_prima_lote_id_fecha_idx" ON "movimientos_materia_prima"("lote_id", "fecha");

-- CreateIndex
CREATE INDEX "lotes_materia_prima_materia_prima_id_fecha_vencimiento_idx" ON "lotes_materia_prima"("materia_prima_id", "fecha_vencimiento");

-- AddForeignKey
ALTER TABLE "movimientos_materia_prima" ADD CONSTRAINT "movimientos_materia_prima_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_materia_prima" ADD CONSTRAINT "movimientos_materia_prima_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_materia_prima"("id") ON DELETE SET NULL ON UPDATE CASCADE;
