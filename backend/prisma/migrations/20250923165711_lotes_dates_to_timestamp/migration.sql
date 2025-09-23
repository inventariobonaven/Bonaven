-- AlterTable
ALTER TABLE "public"."lotes_materia_prima" ALTER COLUMN "fecha_ingreso" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "fecha_vencimiento" SET DATA TYPE TIMESTAMP(6);

-- AlterTable
ALTER TABLE "public"."lotes_producto_terminado" ALTER COLUMN "fecha_ingreso" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "fecha_vencimiento" SET DATA TYPE TIMESTAMP(6);
