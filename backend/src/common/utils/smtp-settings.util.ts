/** 全站发信配置，存于 global_integration_setting.name=smtp 的 config（非环境变量；所有应用共用） */

export type AppSmtpSettings = {
  host: string;
  port: number;
  user: string;
  /** 不落库到 API 响应，仅服务端发信使用 */
  pass: string;
  /** 发件人，如 "Name <noreply@x.com>"；可空则回退为 user */
  from?: string;
  /** 默认 true */
  tlsRejectUnauthorized?: boolean;
};

function readSettingsRoot(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return {};
  return settings as Record<string, unknown>;
}

/** 从 settings 根对象解析 smtp（与全站集成表 JSON 根结构一致；含密码，仅服务端使用） */
export function readSmtpSettingsFromApp(
  settings: unknown,
): Partial<AppSmtpSettings> | null {
  const root = readSettingsRoot(settings);
  const raw = root.smtp;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const host = typeof o.host === 'string' ? o.host.trim() : '';
  const portRaw = typeof o.port === 'number' ? o.port : Number(o.port);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;
  const user = typeof o.user === 'string' ? o.user : '';
  const pass = typeof o.pass === 'string' ? o.pass : '';
  const from = typeof o.from === 'string' ? o.from.trim() : undefined;
  const tlsRejectUnauthorized = o.tlsRejectUnauthorized !== false;
  if (o.enabled === false) return null;
  if (!host || !port || !user) return null;
  return {
    host,
    port,
    user,
    pass,
    ...(from ? { from } : {}),
    tlsRejectUnauthorized,
  };
}

export function isSmtpReadyForSend(
  s: Partial<AppSmtpSettings> | null,
): s is AppSmtpSettings {
  if (!s) return false;
  return !!(s.host && s.port && s.user && s.pass && String(s.pass).length > 0);
}
