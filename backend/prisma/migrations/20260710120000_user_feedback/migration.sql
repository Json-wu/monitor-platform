-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'reviewed', 'resolved', 'archived');

-- CreateTable
CREATE TABLE "user_feedback" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "end_user_id" UUID,
    "nickname" VARCHAR(128) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(256) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'pending',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_feedback_app_id_created_at_idx" ON "user_feedback"("app_id", "created_at");

-- CreateIndex
CREATE INDEX "user_feedback_app_id_status_idx" ON "user_feedback"("app_id", "status");

-- CreateIndex
CREATE INDEX "user_feedback_email_idx" ON "user_feedback"("email");

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_end_user_id_fkey" FOREIGN KEY ("end_user_id") REFERENCES "end_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
