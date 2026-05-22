/** 全站虚拟根对象中的 `integrations` 子对象（由各行 config 组装；与原先 application.settings.integrations 结构一致） */

export type RemoveBackgroundIntegration = {
  url?: string;
  authUser?: string;
  authPass?: string;
  enabled?: boolean;
};

export type LinkmePayIntegration = {
  enabled?: boolean;
  /** 默认 https://api.linkmepay.com */
  baseUrl?: string;
  pid?: string;
  secretKey?: string;
  /** 如 SN20108 PayPal、SN20107 BTC */
  defaultAction?: string;
  /**
   * Monitor 对外公网根地址（无尾斜杠），用于拼接 notify_url。
   * 例：https://your-monitor.example.com
   */
  notifyPublicBase?: string;
};

/**
 * Gumroad 集成：Ping/Webhook 通过 `seller_id` 校验来源；按 `PricingPlan.paymentLink`
 * 匹配商品并发放积分。Gumroad 在「Advanced → Ping」配置 URL：
 *   `${notifyPublicBase}/api/payment/webhooks/gumroad`
 *
 * 说明：sellerId 为 Gumroad 卖家账号 ID（在 ping payload 与产品 URL 中均可见）。
 */
export type GumroadIntegration = {
  enabled?: boolean;
  /** Gumroad seller_id；ping 体中需包含且与此一致 */
  sellerId?: string;
};

export type AppIntegrationsRoot = {
  removeBackground?: RemoveBackgroundIntegration;
  linkmePay?: LinkmePayIntegration;
  gumroad?: GumroadIntegration;
};

export function readIntegrationsRoot(settings: unknown): AppIntegrationsRoot {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return {};
  const s = settings as Record<string, unknown>;
  const raw = s.integrations;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as AppIntegrationsRoot;
}
