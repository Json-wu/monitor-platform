-- Split legacy audit_log into end-user vs system admin logs

CREATE TABLE "end_user_audit_log" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "end_user_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_admin_id" UUID,
    "actor_admin_email" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "end_user_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_operation_log" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "admin_email" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "app_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_operation_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "end_user_audit_log_app_id_created_at_idx" ON "end_user_audit_log"("app_id", "created_at");
CREATE INDEX "end_user_audit_log_end_user_id_created_at_idx" ON "end_user_audit_log"("end_user_id", "created_at");
CREATE INDEX "end_user_audit_log_module_created_at_idx" ON "end_user_audit_log"("module", "created_at");

CREATE INDEX "system_operation_log_admin_id_created_at_idx" ON "system_operation_log"("admin_id", "created_at");
CREATE INDEX "system_operation_log_module_created_at_idx" ON "system_operation_log"("module", "created_at");
CREATE INDEX "system_operation_log_app_id_created_at_idx" ON "system_operation_log"("app_id", "created_at");

ALTER TABLE "end_user_audit_log" ADD CONSTRAINT "end_user_audit_log_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "end_user_audit_log" ADD CONSTRAINT "end_user_audit_log_end_user_id_fkey" FOREIGN KEY ("end_user_id") REFERENCES "end_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "end_user_audit_log" ADD CONSTRAINT "end_user_audit_log_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "system_operation_log" ADD CONSTRAINT "system_operation_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE IF EXISTS "audit_log";
