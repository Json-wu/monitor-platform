/**
 * 根据「订单号 order_no」从库中读取订单与应用 LinkMePay secret，构造 Collect「Notify Merchant」
 * 成功回调体（state=2）并 POST 到本地 Monitor webhook，用于联调。
 *
 * 用法（仓库根或 monitor/backend 下，需已配置 .env 的 DATABASE_URL）：
 *   cd monitor/backend && npx ts-node prisma/scripts/simulate-linkmepay-notify.ts LMP-20260414-U4HCS2R2
 *
 * 可选环境变量：
 *   WEBHOOK_BASE_URL  默认 http://127.0.0.1:${PORT}/api （PORT 来自 .env 或 4000）
 *   DRY_RUN=1         只打印 curl 与 JSON，不发起 HTTP
 *
 * @see https://merchant.linkmepay.com/docs/collect.html#notify-merchant
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { linkmePaySign } from '../../src/modules/linkmepay/linkmepay-signature.util';
import { GLOBAL_INTEGRATION_LINKME_PAY } from '../../src/modules/global-integration/global-integration.constants';

const orderNoArg = process.argv[2]?.trim();
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function baseUrl(): string {
  const port = process.env.PORT || '4000';
  const raw = (process.env.WEBHOOK_BASE_URL || `http://127.0.0.1:${port}/api`).replace(
    /\/+$/,
    '',
  );
  return raw;
}

async function main() {
  if (!orderNoArg) {
    console.error('用法: npx ts-node prisma/scripts/simulate-linkmepay-notify.ts <order_no>');
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/monitor?schema=public',
  });
  const prisma = new PrismaClient({ adapter });

  const order = await prisma.order.findFirst({
    where: { orderNo: orderNoArg },
    include: {
      app: { select: { id: true, name: true } },
      user: { select: { email: true } },
    },
  });

  if (!order) {
    console.error(`未找到订单 order_no=${orderNoArg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const globalRow = await prisma.globalIntegrationSetting.findUnique({
    where: { name: GLOBAL_INTEGRATION_LINKME_PAY },
  });
  const raw = globalRow?.config;
  const lm =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const skRaw = lm.secretKey;
  const secretKey = typeof skRaw === 'string' ? skRaw.trim() : '';
  if (lm.enabled !== true || !secretKey) {
    console.error(
      '全站未启用 LinkMePay 或未配置 secretKey（请在 Monitor 后台「集成 / LinkMePay」检查）。',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const amount = Number(order.amount);
  const ts = String(Date.now());
  const gatewayOrderId =
    order.gatewayOrderId?.trim() || `sim-${order.id.slice(0, 8)}`;

  const payload: Record<string, unknown> = {
    state: 2,
    biz_no: order.orderNo,
    orderNumber: gatewayOrderId,
    amount,
    payed_timestamp: ts,
    time: ts,
    uid: order.user.email,
    args: order.id,
  };

  const signature = linkmePaySign(payload, secretKey);
  const body = { ...payload, signature };

  const url = `${baseUrl()}/payment/webhooks/linkmepay`;
  console.log('订单:', order.orderNo, '当前状态:', order.status, '金额:', amount);
  console.log('POST', url);
  console.log('Body:', JSON.stringify(body, null, 2));

  if (dryRun) {
    console.log('DRY_RUN=1，未发送请求。');
    await prisma.$disconnect();
    return;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('HTTP', res.status, text);

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true, paidAt: true },
  });
  console.log('回调后订单:', after);

  await prisma.$disconnect();
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
