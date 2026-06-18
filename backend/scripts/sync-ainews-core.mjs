#!/usr/bin/env node
/**
 * 从 Supabase 同步 articles + article_summary_cache 到 DATABASE_URL 目标库。
 *
 *   SUPABASE_DB_URL='postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres?sslmode=require' \
 *   DATABASE_URL='postgresql://postgres:pass@localhost:5433/monitor' \
 *   node scripts/sync-ainews-core.mjs
 *
 * 或从 dump 文件（无需连 Supabase）：
 *   node scripts/sync-ainews-core.mjs --from-dump /tmp/ainews-public-data.sql
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  connectPg,
  normalizeDbUrl,
  printSupabaseConnectionHints,
} from './supabase-db-url.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const TABLES = ['articles', 'article_summary_cache'];
const dumpArg = process.argv.indexOf('--from-dump');
const dumpPath = dumpArg >= 0 ? process.argv[dumpArg + 1] : null;

const targetUrl = normalizeDbUrl(
  process.env.DATABASE_URL || process.env.TARGET_DATABASE_URL,
);
if (!targetUrl) {
  console.error('请设置 DATABASE_URL（目标库，如生产代理 5433）');
  process.exit(1);
}

function extractTable(content, name) {
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

async function copyLive(sourceUrl) {
  printSupabaseConnectionHints(sourceUrl);
  const source = await connectPg('Supabase 源库', sourceUrl, pg.Client);
  const target = await connectPg('目标库', targetUrl, pg.Client);

  for (const table of TABLES) {
    const { rows } = await source.query(`SELECT * FROM ${table}`);
    if (rows.length === 0) {
      console.log(`${table}: 源库 0 行，跳过`);
      continue;
    }
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    await target.query(`DELETE FROM ${table}`);
    let n = 0;
    for (const row of rows) {
      const vals = cols.map((c) => row[c]);
      await target.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
        vals,
      );
      n += 1;
    }
    console.log(`${table}: ${n} 行`);
    if (table === 'articles') {
      await target.query(`
        SELECT setval(
          pg_get_serial_sequence('articles', 'id'),
          COALESCE((SELECT MAX(id) FROM articles), 1)
        )
      `);
      console.log('articles: id 序列已同步');
    }
  }

  await source.end();
  await target.end();
}

async function importDump(path) {
  const content = readFileSync(path, 'utf8');
  const target = await connectPg('目标库', targetUrl, pg.Client);
  await target.query('BEGIN');
  await target.query('SET session_replication_role = replica');
  for (const table of TABLES) {
    const sql = extractTable(content, table);
    if (!sql) {
      console.log(`${table}: dump 中未找到，跳过`);
      continue;
    }
    await target.query(`DELETE FROM ${table}`);
    await target.query(sql);
    const r = await target.query(`SELECT count(*)::int AS c FROM ${table}`);
    console.log(`${table}: ${r.rows[0].c} 行`);
    if (table === 'articles') {
      await target.query(`
        SELECT setval(
          pg_get_serial_sequence('articles', 'id'),
          COALESCE((SELECT MAX(id) FROM articles), 1)
        )
      `);
      console.log('articles: id 序列已同步');
    }
  }
  await target.query('COMMIT');
  await target.end();
}

async function main() {
  if (dumpPath) {
    console.log(`从 dump 导入: ${dumpPath}`);
    await importDump(dumpPath);
    return;
  }
  const sourceUrl = normalizeDbUrl(process.env.SUPABASE_DB_URL);
  if (!sourceUrl) {
    console.error('请设置 SUPABASE_DB_URL，或使用 --from-dump <file.sql>');
    process.exit(1);
  }
  await copyLive(sourceUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
