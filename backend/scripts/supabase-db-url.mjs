/** Supabase / 远程 Postgres 连接串校验与 pg Client 选项 */

export function normalizeDbUrl(raw) {
  if (!raw) return null;
  return raw.replace(/\?schema=.*$/, '');
}

export function printSupabaseConnectionHints(url) {
  try {
    const u = new URL(url);
    const lines = [];
    if (u.port === '6543') {
      lines.push(
        '端口 6543 = Transaction pooler，不适合 pg_dump、长迁移或查询 auth.users，易被断开。',
      );
    }
    if (
      u.hostname.endsWith('pooler.supabase.com') &&
      !u.hostname.startsWith('aws-')
    ) {
      lines.push(
        `Pooler 主机名 "${u.hostname}" 可能不完整，Dashboard 上通常为 aws-0-<region>.pooler.supabase.com。`,
      );
    }
    if (lines.length > 0) {
      console.warn('\n⚠️  SUPABASE_DB_URL 提示：');
      for (const line of lines) {
        console.warn(`   • ${line}`);
      }
      console.warn(`   • 推荐改用 Direct connection（:5432）：
     postgresql://postgres:[PASSWORD]@db.qmpkgdlpirzknotugqep.supabase.co:5432/postgres
   Dashboard → Project Settings → Database → Connection string → Direct connection\n`);
    }
  } catch {
    /* ignore invalid URL for hints */
  }
}

export function pgClientOptions(url) {
  const remote =
    url.includes('supabase.co') || url.includes('supabase.com');
  return {
    connectionString: url,
    ...(remote ? { ssl: { rejectUnauthorized: false } } : {}),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
  };
}

export async function connectPg(label, url, Client) {
  const client = new Client(pgClientOptions(url));
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log(`${label} 已连接`);
    return client;
  } catch (e) {
    console.error(
      `\n${label} 连接失败:`,
      e instanceof Error ? e.message : String(e),
    );
    printSupabaseConnectionHints(url);
    console.error(`常见原因：用了 :6543 pooler、主机名错误、密码未 URL 编码、IP 未加入 Database → Network 白名单。`);
    throw e;
  }
}
