import type { Application } from '@prisma/client';

/** 管理端列表/详情返回：不暴露完整 Google OAuth Web Client ID */
export function maskGoogleClientId(
  raw: string | null | undefined,
): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (s.length <= 10) return `${s.slice(0, 2)}****${s.slice(-2)}`;
  return `${s.slice(0, 6)}****${s.slice(-6)}`;
}

export function sanitizeApplicationForApiResponse(
  app: Application,
): Application {
  return {
    ...app,
    googleClientId: maskGoogleClientId(app.googleClientId),
  };
}
