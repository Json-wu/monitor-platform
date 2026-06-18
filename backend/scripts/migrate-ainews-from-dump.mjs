#!/usr/bin/env node
const DEFAULT_TABLES = [
  'articles',
  'article_summary_cache',
  'pending_subscriptions',
  'user_llm_usage_daily',
  'edge_job_locks',
  'user_prefs_logs',
  'article_user_state',
  'article_action_events',
  'subscriptions',
  'user_extension_preferences',
  'email_digest_briefs',
];

/**
 * 从 pg_dump（--inserts）或 supabase db dump 导出的 SQL 导入本地 monitor。
 *
 * 1) 备份（无需 Supabase CLI）：
 *    SUPABASE_DB_URL='postgresql://...' npm run db:backup:ainews
 *
 * 2) 导入：
 *    npm run db:migrate:ainews:from-dump -- backups/ainews-public-XXXX.sql
 *
 * 说明：subscriptions / user_extension_preferences / email_digest_briefs 若源库
 * 列为 user_id 而本地为 end_user_id，INSERT 可能失败（可改用 db:migrate:ainews 做 auth 映射）。
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const dumpPath = process.argv[2];
const tablesArg = process.argv.find((a) => a.startsWith('--tables='));
const tables = tablesArg
  ? tablesArg.slice('--tables='.length).split(',').map((t) => t.trim()).filter(Boolean)
  : DEFAULT_TABLES;

if (!dumpPath || dumpPath.startsWith('--')) {
  console.error('用法: node scripts/migrate-ainews-from-dump.mjs <dump.sql> [--tables=a,b,c]');
  process.exit(1);
}

const targetUrl = (process.env.DATABASE_URL || '').replace(/\?schema=.*$/, '');
if (!targetUrl) {
  console.error('请设置 DATABASE_URL');
  process.exit(1);
}

const content = readFileSync(dumpPath, 'utf8');

function extractTable(name) {
  const marker = `-- Data for Name: ${name};`;
  const start = content.indexOf(marker);
  if (start < 0) return null;
  let rest = content.slice(start);
  const ins = rest.indexOf('INSERT INTO');
  if (ins < 0) return null;
  rest = rest.slice(ins);
  const re = /\n--\n-- Data for Name:/g;
  re.lastIndex = 100;
  const m = re.exec(rest);
  let chunk = m ? rest.slice(0, m.index) : rest;
  chunk = chunk.trim();
  if (!chunk.endsWith(';')) {
    const idx = chunk.lastIndexOf(');');
    if (idx > 0) chunk = chunk.slice(0, idx + 2) + ';';
  }
  return chunk;
}

const client = new pg.Client({ connectionString: targetUrl });
await client.connect();

await client.query('BEGIN');
await client.query('SET session_replication_role = replica');
for (const t of tables) {
  const sql = extractTable(t);
  if (!sql) {
    console.log(`${t}: dump 中未找到，跳过`);
    continue;
  }
  try {
    await client.query(`DELETE FROM ${t}`);
    await client.query(sql);
    const r = await client.query(`SELECT count(*)::int AS c FROM ${t}`);
    console.log(`${t}: ${r.rows[0].c} 行`);
    if (t === 'articles') {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('articles', 'id'),
          COALESCE((SELECT MAX(id) FROM articles), 1)
        )
      `);
      console.log('articles: id 序列已同步');
    }
  } catch (e) {
    console.warn(`${t}: 导入失败 — ${e instanceof Error ? e.message : String(e)}`);
    console.warn(`${t}: 若源库为 Supabase auth.user_id 而本地为 end_user_id，请改用 npm run db:migrate:ainews`);
  }
}
await client.query('COMMIT');
await client.query('RESET ALL');
await client.end();
console.log('完成');
