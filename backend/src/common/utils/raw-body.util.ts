import type { IncomingMessage } from 'http';

/** 在 urlencoded/json verify 中挂载，供 Gumroad Ping 原样中继转发 */
export type RequestWithRawBody = IncomingMessage & { rawBody?: Buffer };

export function isGumroadWebhookPath(url: string | undefined): boolean {
  return !!url?.includes('/payment/webhooks/gumroad');
}
