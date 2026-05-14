-- AlterTable
ALTER TABLE "end_user" ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_verification_code" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'register',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_code_app_id_email_idx" ON "email_verification_code"("app_id", "email");

-- AddForeignKey
ALTER TABLE "email_verification_code" ADD CONSTRAINT "email_verification_code_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
