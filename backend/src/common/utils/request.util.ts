import { Request } from 'express';

export function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return xf.split(',')[0].trim();
  }
  const raw = req.socket?.remoteAddress || '';
  return raw.replace('::ffff:', '') || '0.0.0.0';
}
