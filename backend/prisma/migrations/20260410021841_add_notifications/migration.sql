-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'in_app', 'webhook');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('draft', 'queued', 'sent', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "notification_template" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "template_id" UUID,
    "user_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "error_message" TEXT,
    "metadata" JSONB,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_app_id_slug_key" ON "notification_template"("app_id", "slug");

-- CreateIndex
CREATE INDEX "notification_log_app_id_created_at_idx" ON "notification_log"("app_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_log_user_id_created_at_idx" ON "notification_log"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "end_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
