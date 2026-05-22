-- 定价方案：新增支付链接（Gumroad 产品 URL 等）
ALTER TABLE "pricing_plan" ADD COLUMN "payment_link" TEXT;
