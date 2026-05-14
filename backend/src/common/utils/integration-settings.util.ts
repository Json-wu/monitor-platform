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

export type AppIntegrationsRoot = {
  removeBackground?: RemoveBackgroundIntegration;
  linkmePay?: LinkmePayIntegration;
};

export function readIntegrationsRoot(settings: unknown): AppIntegrationsRoot {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return {};
  const s = settings as Record<string, unknown>;
  const raw = s.integrations;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as AppIntegrationsRoot;
}
