/** API 错误，可携带多条提示文案（如 class-validator 校验结果） */
export class ApiError extends Error {
  readonly messages: string[];

  constructor(messages: string[]) {
    const list = messages.filter(Boolean);
    super(list.join("\n"));
    this.name = "ApiError";
    this.messages = list.length > 0 ? list : ["请求失败，请稍后重试。"];
  }
}

const VALIDATION_RULES: Array<{
  pattern: RegExp;
  format: string | ((match: RegExpMatchArray) => string);
}> = [
  { pattern: /^email must be an email$/i, format: "请输入有效的邮箱地址" },
  {
    pattern: /^password must be longer than or equal to (\d+) characters$/i,
    format: (m) => `密码至少 ${m[1]} 位`,
  },
  { pattern: /^password must be a string$/i, format: "请输入密码" },
  { pattern: /^name must be a string$/i, format: "请输入姓名" },
  { pattern: /^name should not be empty$/i, format: "请输入姓名" },
  { pattern: /^roleId must be a UUID$/i, format: "请选择有效的角色" },
  { pattern: /^roleId should not be empty$/i, format: "请选择角色" },
  {
    pattern: /^(.+) must be longer than or equal to (\d+) characters$/i,
    format: (m) => `${fieldLabel(m[1])}至少 ${m[2]} 位`,
  },
  { pattern: /^(.+) must be an email$/i, format: () => "请输入有效的邮箱地址" },
  { pattern: /^(.+) must be a UUID$/i, format: (m) => `${fieldLabel(m[1])}格式不正确` },
  { pattern: /^(.+) should not be empty$/i, format: (m) => `${fieldLabel(m[1])}不能为空` },
  { pattern: /^(.+) must be a string$/i, format: (m) => `请填写${fieldLabel(m[1])}` },
];

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    email: "邮箱",
    password: "密码",
    name: "姓名",
    roleId: "角色",
    slug: "标识",
    domain: "域名",
  };
  return map[field] ?? field;
}

function translateValidationMessage(message: string): string {
  const trimmed = message.trim();
  for (const rule of VALIDATION_RULES) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      return typeof rule.format === "function" ? rule.format(match) : rule.format;
    }
  }
  return formatApiErrorMessage(trimmed);
}

/** 将接口错误转为多条中文提示 */
export function parseApiErrorMessages(raw: unknown): string[] {
  let parts: string[] = [];

  if (Array.isArray(raw)) {
    parts = raw.map((item) => String(item).trim()).filter(Boolean);
  } else if (typeof raw === "string") {
    const normalized = raw.trim();
    if (!normalized) {
      parts = [];
    } else if (/ must .+, .+ must /.test(normalized)) {
      parts = normalized.split(/,\s*(?=[a-zA-Z_]+ must )/).map((s) => s.trim());
    } else if (normalized.includes(", ")) {
      parts = normalized.split(", ").map((s) => s.trim());
    } else {
      parts = [normalized];
    }
  } else if (raw && typeof raw === "object") {
    parts = [JSON.stringify(raw)];
  } else {
    parts = [];
  }

  const translated = parts.map(translateValidationMessage);
  return [...new Set(translated.filter(Boolean))];
}

const NETWORK_ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /^failed to fetch$/i, message: "网络请求失败，请检查网络连接或后端服务是否可用。" },
  { pattern: /^networkerror when attempting to fetch resource\.?$/i, message: "网络请求失败，请检查网络连接或后端服务是否可用。" },
  { pattern: /^load failed$/i, message: "网络请求失败，请稍后重试。" },
  { pattern: /^network request failed$/i, message: "网络请求失败，请检查网络连接。" },
  { pattern: /^fetch failed$/i, message: "网络请求失败，请检查网络连接或后端服务是否可用。" },
];

/** 将单条接口错误文案转为更易读的中文提示 */
export function formatApiErrorMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized) {
    return "请求失败，请稍后重试。";
  }
  for (const { pattern, message: text } of NETWORK_ERROR_PATTERNS) {
    if (pattern.test(normalized)) return text;
  }
  if (normalized === "Internal server error") {
    return "服务器内部错误，请稍后重试。";
  }
  if (normalized === "Request failed") {
    return "请求失败，请稍后重试。";
  }
  if (normalized === "Email already exists") {
    return "该邮箱已被注册。";
  }
  if (normalized === "Missing application context (appId).") {
    return "缺少应用上下文，请从应用列表重新进入。";
  }
  return normalized;
}

export function getErrorMessages(err: unknown): string[] {
  if (err instanceof ApiError) return err.messages;
  if (err instanceof TypeError && err.message) {
    return parseApiErrorMessages(err.message);
  }
  if (err instanceof Error) return parseApiErrorMessages(err.message);
  if (typeof err === "string") return parseApiErrorMessages(err);
  return ["操作失败，请稍后重试。"];
}
