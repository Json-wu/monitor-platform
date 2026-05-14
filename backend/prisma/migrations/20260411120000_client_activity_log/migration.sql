-- CreateTable
CREATE TABLE "client_activity_log" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "end_user_id" UUID,
    "visitor_id" VARCHAR(128) NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "client_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_activity_log_app_id_created_at_idx" ON "client_activity_log"("app_id", "created_at");
CREATE INDEX "client_activity_log_visitor_id_created_at_idx" ON "client_activity_log"("visitor_id", "created_at");
CREATE INDEX "client_activity_log_end_user_id_created_at_idx" ON "client_activity_log"("end_user_id", "created_at");
CREATE INDEX "client_activity_log_category_action_idx" ON "client_activity_log"("category", "action");

-- AddForeignKey
ALTER TABLE "client_activity_log" ADD CONSTRAINT "client_activity_log_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_activity_log" ADD CONSTRAINT "client_activity_log_end_user_id_fkey" FOREIGN KEY ("end_user_id") REFERENCES "end_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
