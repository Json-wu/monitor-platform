-- CreateEnum
CREATE TYPE "TriggerEvent" AS ENUM ('manual', 'order_paid', 'order_refunded', 'user_registered', 'credits_low', 'credits_granted');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'wecom';

-- AlterTable
ALTER TABLE "notification_template" ADD COLUMN     "trigger_event" "TriggerEvent",
ADD COLUMN     "webhook_url" TEXT;
