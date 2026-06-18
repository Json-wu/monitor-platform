/** 与仓库 `lib/url-id.ts` 保持一致 */
export function idFromUrl(url: string): string {
  let h = 5381
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h + url.charCodeAt(i)) | 0
  }
  return `u${(h >>> 0).toString(16)}`
}
