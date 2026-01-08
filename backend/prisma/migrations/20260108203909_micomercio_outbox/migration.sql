-- CreateTable
CREATE TABLE "public"."integracion_outbox" (
    "id" SERIAL NOT NULL,
    "proveedor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ref_id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_status" INTEGER,
    "last_resp" JSONB,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integracion_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integracion_outbox_estado_next_run_at_idx" ON "public"."integracion_outbox"("estado", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "integracion_outbox_proveedor_tipo_ref_id_key" ON "public"."integracion_outbox"("proveedor", "tipo", "ref_id");
