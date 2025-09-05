-- AlterTable
ALTER TABLE "recetas" ADD COLUMN     "categoria_id" INTEGER;

-- CreateTable
CREATE TABLE "categorias_receta" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" BOOLEAN DEFAULT true,

    CONSTRAINT "categorias_receta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_receta_nombre_key" ON "categorias_receta"("nombre");

-- CreateIndex
CREATE INDEX "recetas_categoria_id_idx" ON "recetas"("categoria_id");

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_receta"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
