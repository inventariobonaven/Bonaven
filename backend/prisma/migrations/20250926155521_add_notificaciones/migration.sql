-- CreateTable
CREATE TABLE "public"."notificaciones" (
    "id" SERIAL NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "payload" JSONB,
    "target_rol" VARCHAR(20) NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_leida_target_rol_created_at_idx" ON "public"."notificaciones"("leida", "target_rol", "created_at");
