/** 将应用配置的 domain 规范为站点 origin（含协议） */
export function siteOriginFromDomain(domain: string): string {
  const t = domain.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).origin;
    } catch {
      return "";
    }
  }
  return `https://${t.replace(/^\/+|\/+$/g, "")}`;
}

/** 按常见路径依次尝试站点 favicon / logo */
export function domainFaviconCandidates(domain: string | null | undefined): string[] {
  const origin = domain ? siteOriginFromDomain(domain) : "";
  if (!origin) return [];
  return [
    `${origin}/icon`,
    `${origin}/favicon.png`,
    `${origin}/favicon.ico`,
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
  ];
}
