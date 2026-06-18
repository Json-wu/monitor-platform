/** 将分钟数转为 cron 表达式（1–59 分钟用每 N 分钟；≥60 且整除 60 则用每小时）。 */
export function cronEveryMinutes(minutes: number): string {
  const m = Math.max(1, Math.floor(minutes));
  if (m >= 60 && m % 60 === 0) {
    const hours = m / 60;
    return hours === 1 ? '0 * * * *' : `0 */${hours} * * *`;
  }
  const every = Math.min(59, m);
  return `*/${every} * * * *`;
}

export function parseIntervalMinutes(
  raw: string | undefined,
  fallback: number,
): number {
  const n = parseInt(raw ?? String(fallback), 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(1440, n);
}
