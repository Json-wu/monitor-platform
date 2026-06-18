/** Node / Nest 运行时环境变量（原 Deno Edge 使用 Deno.env）。 */
export function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
