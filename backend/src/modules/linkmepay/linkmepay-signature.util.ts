import { createHash } from 'crypto';

/** 对象键排序后 JSON.stringify（与文档「inner keys sorted」一致） */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const o = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    sorted[k] = o[k];
  }
  return JSON.stringify(sorted);
}

/**
 * LinkMePay SHA256 签名：参数名字典序，key=value 用 & 连接，排除 signature；
 * null/undefined 不参与；对象转为排序键后的 JSON 字符串。
 * 最后在末尾拼接 secretKey，再 SHA256 十六进制。
 * @see https://merchant.linkmepay.com/docs/introduction.html
 */
export function linkmePayBuildSignString(
  params: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const key of Object.keys(params).sort()) {
    if (key === 'signature') continue;
    const v = params[key];
    if (v === null || v === undefined) continue;
    let strVal: string;
    if (typeof v === 'object' && v !== null) {
      strVal = stableStringify(v);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      strVal = String(v);
    } else if (typeof v === 'string') {
      strVal = v;
    } else {
      strVal = '';
    }
    parts.push(`${key}=${strVal}`);
  }
  return parts.join('&');
}

export function linkmePaySign(
  params: Record<string, unknown>,
  secretKey: string,
): string {
  const base = linkmePayBuildSignString(params);
  return createHash('sha256')
    .update(base + secretKey)
    .digest('hex');
}
