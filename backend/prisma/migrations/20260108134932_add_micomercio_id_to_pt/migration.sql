/*
  Warnings:

  - You are about to drop the column `codigo_barras` on the `productos_terminados` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[micomercio_id]` on the table `productos_terminados` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."productos_terminados_codigo_barras_key";

-- AlterTable
ALTER TABLE "public"."productos_terminados" DROP COLUMN "codigo_barras",
ADD COLUMN     "micomercio_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "productos_terminados_micomercio_id_key" ON "public"."productos_terminados"("micomercio_id");
