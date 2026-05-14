/** OpenAPI / Swagger UI，与 `NEXT_PUBLIC_API_BASE_URL`（通常以 `/api` 结尾）拼接为 `.../api/docs`。 */
export function getApiDocsUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
  if (/\/api$/i.test(raw)) return `${raw}/docs`;
  return `${raw}/api/docs`;
}
