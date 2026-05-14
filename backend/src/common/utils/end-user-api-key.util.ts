import { randomBytes } from 'crypto';

/** 终端用户调用公开 API（如 clearbg）的密钥；由用户在控制台主动生成 */
export function generateEndUserApiKey(): string {
  return `eu_${randomBytes(24).toString('base64url')}`;
}

/** 控制台展示用脱敏，不暴露完整密钥 */
export function maskEndUserApiKey(full: string): string {
  const s = full.trim();
  if (s.length < 12) return 'eu_****';
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}
