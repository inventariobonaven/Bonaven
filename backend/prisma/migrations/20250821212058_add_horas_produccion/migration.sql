-- AlterTable
ALTER TABLE "producciones" ADD COLUMN     "duracion_minutos" INTEGER,
ADD COLUMN     "hora_fin" TIMESTAMP(6),
ADD COLUMN     "hora_inicio" TIMESTAMP(6);
