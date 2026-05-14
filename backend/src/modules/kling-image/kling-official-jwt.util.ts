import * as crypto from 'crypto';

/** 与可灵 document-api 常见约定一致：HS256，payload.iss=AccessKey，SecretKey 签名（见 kling-api auth 实现） */
const TOKEN_VALIDITY_SECONDS = 1800;
const CLOCK_SKEW_SECONDS = 5;

function base64urlJson(obj: object): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlBuffer(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** 生成 Authorization: Bearer &lt;jwt&gt; 中的 JWT 段 */
export function signKlingOfficialJwt(
  accessKey: string,
  secretKey: string,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey.trim(),
    exp: now + TOKEN_VALIDITY_SECONDS,
    nbf: now - CLOCK_SKEW_SECONDS,
  };
  const h = base64urlJson(header);
  const p = base64urlJson(payload);
  const sig = crypto
    .createHmac('sha256', secretKey.trim())
    .update(`${h}.${p}`)
    .digest();
  return `${h}.${p}.${base64urlBuffer(sig)}`;
}
