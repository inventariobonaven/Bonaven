-- AlterTable
ALTER TABLE "productos_terminados" ADD COLUMN     "bolsas_por_unidad" DECIMAL(18,3) NOT NULL DEFAULT 1,
ADD COLUMN     "descripcion_contenido" TEXT,
ADD COLUMN     "empaque_mp_id" INTEGER,
ADD COLUMN     "unidades_por_empaque" INTEGER;

-- CreateIndex
CREATE INDEX "productos_terminados_empaque_mp_id_idx" ON "productos_terminados"("empaque_mp_id");

-- AddForeignKey
ALTER TABLE "productos_terminados" ADD CONSTRAINT "productos_terminados_empaque_mp_id_fkey" FOREIGN KEY ("empaque_mp_id") REFERENCES "materias_primas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
