-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'PRODUCCION');

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "tabla_afectada" TEXT NOT NULL,
    "tipo_operacion" TEXT NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "usuario_id" INTEGER,
    "fecha" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" SERIAL NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "fecha_backup" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "realizado_por" INTEGER,
    "descripcion" TEXT,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_venta" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER,
    "producto_id" INTEGER,
    "presentacion_id" INTEGER,
    "cantidad" DECIMAL NOT NULL,

    CONSTRAINT "detalles_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empaques_por_presentacion" (
    "id" SERIAL NOT NULL,
    "presentacion_id" INTEGER,
    "empaque_id" INTEGER,
    "cantidad_empaque" DECIMAL NOT NULL,

    CONSTRAINT "empaques_por_presentacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredientes_receta" (
    "id" SERIAL NOT NULL,
    "receta_id" INTEGER,
    "materia_prima_id" INTEGER,
    "cantidad" DECIMAL NOT NULL,

    CONSTRAINT "ingredientes_receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_materia_prima" (
    "id" SERIAL NOT NULL,
    "materia_prima_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "cantidad" DECIMAL NOT NULL,
    "fecha_ingreso" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "estado" TEXT NOT NULL,

    CONSTRAINT "lotes_materia_prima_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materias_primas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "unidad_medida" TEXT NOT NULL,
    "estado" BOOLEAN DEFAULT true,

    CONSTRAINT "materias_primas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentaciones" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER,
    "nombre" TEXT NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "unidad_medida" TEXT NOT NULL,

    CONSTRAINT "presentaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producciones" (
    "id" SERIAL NOT NULL,
    "receta_id" INTEGER,
    "cantidad_producida" DECIMAL NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,

    CONSTRAINT "producciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos_terminados" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" BOOLEAN DEFAULT true,

    CONSTRAINT "productos_terminados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "estado" BOOLEAN DEFAULT true,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recetas" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER,
    "presentacion_id" INTEGER,
    "nombre" TEXT NOT NULL,
    "estado" BOOLEAN DEFAULT true,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_producto_terminado" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER,
    "presentacion_id" INTEGER,
    "cantidad" DECIMAL NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,

    CONSTRAINT "stock_producto_terminado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trazabilidad_produccion" (
    "id" SERIAL NOT NULL,
    "produccion_id" INTEGER,
    "lote_id" INTEGER,
    "materia_prima_id" INTEGER,
    "cantidad_usada" DECIMAL NOT NULL,

    CONSTRAINT "trazabilidad_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "contrasena" TEXT NOT NULL,
    "estado" BOOLEAN DEFAULT true,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "cliente" TEXT,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empaques_por_presentacion_presentacion_id_empaque_id_key" ON "empaques_por_presentacion"("presentacion_id", "empaque_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredientes_receta_receta_id_materia_prima_id_key" ON "ingredientes_receta"("receta_id", "materia_prima_id");

-- CreateIndex
CREATE UNIQUE INDEX "presentaciones_producto_id_nombre_key" ON "presentaciones"("producto_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_terminados_nombre_key" ON "productos_terminados"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_realizado_por_fkey" FOREIGN KEY ("realizado_por") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "empaques_por_presentacion" ADD CONSTRAINT "empaques_por_presentacion_empaque_id_fkey" FOREIGN KEY ("empaque_id") REFERENCES "materias_primas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "empaques_por_presentacion" ADD CONSTRAINT "empaques_por_presentacion_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ingredientes_receta" ADD CONSTRAINT "ingredientes_receta_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ingredientes_receta" ADD CONSTRAINT "ingredientes_receta_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lotes_materia_prima" ADD CONSTRAINT "lotes_materia_prima_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lotes_materia_prima" ADD CONSTRAINT "lotes_materia_prima_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "presentaciones" ADD CONSTRAINT "presentaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "producciones" ADD CONSTRAINT "producciones_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_producto_terminado" ADD CONSTRAINT "stock_producto_terminado_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_producto_terminado" ADD CONSTRAINT "stock_producto_terminado_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_terminados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trazabilidad_produccion" ADD CONSTRAINT "trazabilidad_produccion_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_materia_prima"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trazabilidad_produccion" ADD CONSTRAINT "trazabilidad_produccion_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trazabilidad_produccion" ADD CONSTRAINT "trazabilidad_produccion_produccion_id_fkey" FOREIGN KEY ("produccion_id") REFERENCES "producciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
