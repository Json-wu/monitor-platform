#!/usr/bin/env node
/**
 * 从 Supabase 迁移 Industry AI News 数据到本地 monitor 库
 *
 * 方式 A：npm run db:migrate:ainews:cli（需 industry-ai-news-plugin 已 supabase link）
 * 方式 B：SUPABASE_DB_URL='postgresql://...' npm run db:migrate:ainews
 * 方式 C：pg_dump 导出后 npm run db:migrate:ainews:from-dump -- /path/to/dump.sql
 *
 * 连接串注意：密码含 @ # 等须 URL 编码（@ → %40）。
 */

import pg from 'pg';
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

const AINEWS_APP_SLUG = process.env.AINEWS_APP_SLUG?.trim() || 'chrome-ainews';

const sourceUrl = normalizeDbUrl(process.env.SUPABASE_DB_URL);
const targetUrl = normalizeDbUrl(
  process.env.DATABASE_URL || process.env.TARGET_DATABASE_URL,
);

if (!sourceUrl) {
  console.error(
    '请设置 SUPABASE_DB_URL（Dashboard → Database → Direct connection，:5432）',
  );
  process.exit(1);
}
if (!targetUrl) {
  console.error('请设置 DATABASE_URL（monitor-platform/backend/.env）');
  process.exit(1);
}

printSupabaseConnectionHints(sourceUrl);

let source;
let target;

async function count(client, table) {
  const r = await client.query(`SELECT count(*)::int AS c FROM ${table}`);
  return r.rows[0]?.c ?? 0;
}

async function copyDirect(table, columns) {
  const cols = columns.join(', ');
  const n = await count(source, table);
  if (n === 0) {
    console.log(`  ${table}: 源库 0 行，跳过`);
    return 0;
  }
  await target.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
  await target.query(`
    INSERT INTO ${table} (${cols})
    SELECT ${cols} FROM dblink(
      'hostaddr=0.0.0.0',
      'SELECT 1'
    ) AS t(x int) WHERE false
  `).catch(() => {});

  const { rows } = await source.query(`SELECT ${cols} FROM ${table}`);
  if (rows.length === 0) return 0;

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  let inserted = 0;
  for (const row of rows) {
    const vals = columns.map((c) => row[c]);
    try {
      const r = await target.query(insertSql, vals);
      inserted += r.rowCount ?? 0;
    } catch (e) {
      console.warn(`  ${table} 行插入失败:`, e.message?.slice(0, 120));
    }
  }
  console.log(`  ${table}: ${inserted}/${rows.length} 行`);
  return inserted;
}

/** 批量 INSERT（无 dblink，逐批 fetch） */
async function copyTable(table, columns, transformRow = (r) => r) {
  const srcCount = await count(source, table);
  if (srcCount === 0) {
    console.log(`  ${table}: 源库 0 行，跳过`);
    return 0;
  }

  await target.query(`DELETE FROM ${table}`);

  const cols = columns.join(', ');
  const { rows } = await source.query(`SELECT * FROM ${table}`);
  let inserted = 0;
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  for (const raw of rows) {
    const row = transformRow(raw);
    if (!row) continue;
    const vals = columns.map((c) => row[c] ?? null);
    try {
      await target.query(
        `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals,
      );
      inserted++;
    } catch (e) {
      console.warn(`  ${table} 跳过一行:`, e.message?.slice(0, 100));
    }
  }
  console.log(`  ${table}: ${inserted}/${rows.length} 行`);
  return inserted;
}

async function ensureEndUsersFromAuth(appId) {
  const { rows: authUsers } = await source.query(`
    SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data
    FROM auth.users
    WHERE email IS NOT NULL AND trim(email) <> ''
  `);
  if (authUsers.length === 0) {
    console.log('  auth.users: 0 行');
    return new Map();
  }

  const authToEnd = new Map();
  for (const au of authUsers) {
    const email = String(au.email).trim().toLowerCase();
    const existing = await target.query(
      `SELECT id FROM end_user WHERE app_id = $1 AND lower(email) = $2 LIMIT 1`,
      [appId, email],
    );
    if (existing.rows[0]) {
      authToEnd.set(au.id, existing.rows[0].id);
      continue;
    }
    const name =
      au.raw_user_meta_data?.full_name ||
      au.raw_user_meta_data?.name ||
      email.split('@')[0];
    const ins = await target.query(
      `INSERT INTO end_user (id, app_id, email, name, oauth_provider, oauth_id, email_verified_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'supabase_import', $4, now(), $5, now())
       RETURNING id`,
      [appId, email, String(name), au.id, au.created_at ?? new Date()],
    );
    authToEnd.set(au.id, ins.rows[0].id);
  }
  console.log(`  end_user: 映射/新建 ${authToEnd.size} 个（来自 auth.users）`);
  return authToEnd;
}

async function main() {
  source = await connectPg('Supabase', sourceUrl, pg.Client);
  target = await connectPg('本地 monitor', targetUrl, pg.Client);

  const appRes = await target.query(
    `SELECT id FROM application WHERE slug = $1 LIMIT 1`,
    [AINEWS_APP_SLUG],
  );
  const appId = appRes.rows[0]?.id;
  if (!appId) {
    throw new Error(`本地未找到 application.slug=${AINEWS_APP_SLUG}，请先 prisma db seed`);
  }

  console.log('\n=== 1. 直接复制（结构一致）===');
  await copyTable('articles', [
    'id', 'canonical_url', 'source_url', 'title', 'published_at', 'source',
    'domains', 'raw_summary', 'image_url', 'created_at',
  ]);
  await target.query(`
    SELECT setval(
      pg_get_serial_sequence('articles', 'id'),
      COALESCE((SELECT MAX(id) FROM articles), 1)
    )
  `);
  console.log('articles: id 序列已同步');
  await copyTable('article_summary_cache', [
    'url', 'locale', 'title', 'summary', 'model', 'updated_at',
  ]);
  await copyTable('user_prefs_logs', [
    'id', 'user_id', 'ip', 'timezone', 'follow_domains', 'reminder_mode',
    'reminder_dnd', 'reminder_interval_minutes', 'reminder_window_start_hour',
    'reminder_window_end_hour', 'ui_lang', 'ui_theme', 'system_language', 'created_at',
  ]);
  await copyTable('article_user_state', [
    'user_id', 'canonical_url', 'liked', 'disliked', 'read',
    'like_count', 'dislike_count', 'read_count',
    'liked_at', 'disliked_at', 'read_at', 'updated_at',
  ]);
  await copyTable('article_action_events', [
    'id', 'user_id', 'action', 'canonical_url', 'source_url', 'ip', 'timezone', 'created_at',
  ]);
  await copyTable('pending_subscriptions', [
    'email', 'plan', 'status', 'gumroad_sale_id', 'gumroad_subscription_id',
    'gumroad_product_id', 'last_paid_at', 'current_period_start', 'current_period_end',
    'recurrence', 'raw_payload', 'created_at', 'updated_at',
  ]);
  await copyTable('user_llm_usage_daily', ['user_id', 'usage_day', 'summarize_calls']);
  await copyTable('edge_job_locks', ['job_name', 'locked_until', 'worker_id', 'updated_at']);

  console.log('\n=== 2. auth.users → end_user ===');
  const authToEnd = await ensureEndUsersFromAuth(appId);

  console.log('\n=== 3. anon_users → end_user（统一终端用户表）===');
  const coalesce = (v, d) => (v == null || v === '' ? d : v);
  const { rows: anonRows } = await source.query('SELECT * FROM anon_users');
  let guestN = 0;
  let linkedN = 0;
  for (const r of anonRows) {
    const linkedEndUserId = r.auth_user_id
      ? authToEnd.get(r.auth_user_id) ?? null
      : null;
    const guestEmail = `guest+${String(r.id).replace(/-/g, '')}@ainews.internal`;
    const lastSeenAt = r.last_seen_at ?? r.created_at;
    const ainewsProfile = [
      coalesce(r.device_id, ''),
      coalesce(r.email, ''),
      coalesce(r.timezone, ''),
      r.follow_domains ?? [],
      coalesce(r.ui_lang, ''),
      coalesce(r.ui_theme, 'system'),
      coalesce(r.system_language, ''),
      coalesce(r.reminder_mode, 'realtime'),
      r.reminder_dnd ?? false,
      r.reminder_interval_minutes ?? 5,
      r.reminder_window_start_hour ?? 9,
      r.reminder_window_end_hour ?? 18,
      coalesce(r.user_tier, 'free'),
      coalesce(r.last_seen_ip, ''),
      r.linked_at ?? (linkedEndUserId ? new Date() : null),
    ];
    try {
      if (linkedEndUserId) {
        await target.query(
          `UPDATE end_user SET
            ainews_device_id = CASE WHEN trim(ainews_device_id) = '' THEN $2 ELSE ainews_device_id END,
            ainews_email = CASE WHEN trim(ainews_email) = '' THEN $3 ELSE ainews_email END,
            ainews_timezone = CASE WHEN trim(ainews_timezone) = '' THEN $4 ELSE ainews_timezone END,
            ainews_follow_domains = CASE WHEN cardinality(ainews_follow_domains) = 0 THEN $5::text[] ELSE ainews_follow_domains END,
            ainews_ui_lang = CASE WHEN trim(ainews_ui_lang) = '' THEN $6 ELSE ainews_ui_lang END,
            ainews_ui_theme = COALESCE(NULLIF(trim($7), ''), ainews_ui_theme),
            ainews_system_language = CASE WHEN trim(ainews_system_language) = '' THEN $8 ELSE ainews_system_language END,
            ainews_reminder_mode = COALESCE(NULLIF(trim($9), ''), ainews_reminder_mode),
            ainews_reminder_dnd = $10,
            ainews_reminder_interval_minutes = $11,
            ainews_reminder_window_start_hour = $12,
            ainews_reminder_window_end_hour = $13,
            ainews_user_tier = COALESCE(NULLIF(trim($14), ''), ainews_user_tier),
            ainews_last_seen_ip = COALESCE(NULLIF(trim($15), ''), ainews_last_seen_ip),
            ainews_linked_at = COALESCE(ainews_linked_at, $16),
            last_active_at = GREATEST(last_active_at, $17),
            updated_at = now()
          WHERE id = $1`,
          [linkedEndUserId, ...ainewsProfile, lastSeenAt],
        );
        if (linkedEndUserId !== r.id) {
          await target.query(
            `UPDATE user_prefs_logs SET user_id = $1 WHERE user_id = $2`,
            [linkedEndUserId, r.id],
          );
          await target.query(
            `UPDATE article_action_events SET user_id = $1 WHERE user_id = $2`,
            [linkedEndUserId, r.id],
          );
          await target.query(
            `DELETE FROM article_user_state aus
             USING article_user_state x
             WHERE aus.user_id = $2 AND x.user_id = $1 AND x.canonical_url = aus.canonical_url`,
            [linkedEndUserId, r.id],
          );
          await target.query(
            `UPDATE article_user_state SET user_id = $1 WHERE user_id = $2`,
            [linkedEndUserId, r.id],
          );
          await target.query(`DELETE FROM end_user WHERE id = $1 AND oauth_provider = 'device'`, [
            r.id,
          ]);
        }
        linkedN++;
      } else {
        await target.query(
          `INSERT INTO end_user (
            id, app_id, email, oauth_provider, oauth_id, status, metadata,
            created_at, updated_at, last_active_at,
            ainews_device_id, ainews_email, ainews_timezone, ainews_follow_domains,
            ainews_ui_lang, ainews_ui_theme, ainews_system_language,
            ainews_reminder_mode, ainews_reminder_dnd, ainews_reminder_interval_minutes,
            ainews_reminder_window_start_hour, ainews_reminder_window_end_hour,
            ainews_user_tier, ainews_last_seen_ip
          ) VALUES (
            $1,$2,$3,'device',$4,'active','{}'::jsonb,$5,$6,$7,
            $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
          ) ON CONFLICT (id) DO UPDATE SET
            last_active_at = GREATEST(end_user.last_active_at, EXCLUDED.last_active_at),
            updated_at = now()`,
          [
            r.id,
            appId,
            guestEmail,
            coalesce(r.device_id, '') || null,
            r.created_at,
            r.updated_at ?? r.created_at,
            r.last_seen_at ?? r.created_at,
            ...ainewsProfile.slice(0, 14),
          ],
        );
        guestN++;
      }
    } catch (e) {
      console.warn('  anon→end_user 跳过:', r.id, e.message?.slice(0, 100));
    }
  }
  console.log(`  end_user ainews: guest ${guestN}, linked ${linkedN} / ${anonRows.length} 行`);

  console.log('\n=== 4. subscriptions → subscription（平台统一订阅表）===');
  const { rows: subs } = await source.query('SELECT * FROM subscriptions');
  let subN = 0;
  for (const s of subs) {
    const endUserId =
      authToEnd.get(s.user_id) ??
      authToEnd.get(s.end_user_id) ??
      s.end_user_id ??
      null;
    if (!endUserId) continue;
    const planSlug = String(s.plan ?? '').trim();
    if (planSlug !== 'pro' && planSlug !== 'unlimited') continue;
    try {
      const planRes = await target.query(
        `SELECT id FROM pricing_plan
         WHERE app_id = $1 AND is_active = true
           AND (
             slug = $2
             OR slug ILIKE '%' || $2 || '%'
             OR COALESCE(payment_link, '') ILIKE $3
           )
         ORDER BY sort_order ASC LIMIT 1`,
        [
          appId,
          planSlug,
          planSlug === 'pro' ? '%industry-ai-news-pro%' : '%industry-ai-news-unlimited%',
        ],
      );
      const planId = planRes.rows[0]?.id;
      if (!planId) {
        console.warn('  subscription 跳过: 无 pricing_plan', planSlug);
        continue;
      }
      const subStatus =
        s.status === 'active'
          ? 'active'
          : s.status === 'expired'
            ? 'expired'
            : s.status === 'past_due'
              ? 'past_due'
              : 'cancelled';
      await target.query(
        `INSERT INTO subscription (
          id, app_id, user_id, plan_id, status, gateway_sub_id,
          current_period_start, current_period_end, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4::"SubStatus", $5, $6, $7, $8, $9
        )
        ON CONFLICT (app_id, user_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          status = EXCLUDED.status,
          gateway_sub_id = COALESCE(EXCLUDED.gateway_sub_id, subscription.gateway_sub_id),
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = now()`,
        [
          appId,
          endUserId,
          planId,
          subStatus,
          s.gumroad_subscription_id ?? null,
          s.current_period_start ?? s.last_paid_at ?? s.created_at ?? new Date(),
          s.current_period_end ??
            s.current_period_start ??
            s.last_paid_at ??
            new Date(),
          s.created_at ?? new Date(),
          s.updated_at ?? new Date(),
        ],
      );
      subN++;
    } catch (e) {
      console.warn('  subscription 跳过:', e.message?.slice(0, 100));
    }
  }
  console.log(`  subscription: ${subN}/${subs.length} 行`);

  console.log('\n=== 5. user_extension_preferences / email_digest_briefs ===');
  const { rows: prefs } = await source.query('SELECT * FROM user_extension_preferences');
  let prefN = 0;
  for (const p of prefs) {
    const endUserId = authToEnd.get(p.user_id);
    if (!endUserId) continue;
    try {
      await target.query(
        `INSERT INTO user_extension_preferences (
          end_user_id, industry_ids, is_pro, reminder_mode, reminder_email, news_mock_only,
          ui_theme, onboarding_complete, follow_keywords, last_email_digest_at,
          email_digest_opt_out, timezone, ui_lang, last_daily_digest_date,
          email_digest_trial_sent_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT DO NOTHING`,
        [
          endUserId, p.industry_ids ?? [], p.is_pro ?? false, p.reminder_mode ?? 'every2h',
          p.reminder_email ?? '', p.news_mock_only ?? false, p.ui_theme ?? 'light',
          p.onboarding_complete ?? false, p.follow_keywords ?? [], p.last_email_digest_at,
          p.email_digest_opt_out ?? false, p.timezone ?? 'UTC', p.ui_lang ?? 'en',
          p.last_daily_digest_date, p.email_digest_trial_sent_at, p.updated_at,
        ],
      );
      prefN++;
    } catch (e) {
      console.warn('  user_extension_preferences 跳过:', e.message?.slice(0, 80));
    }
  }
  console.log(`  user_extension_preferences: ${prefN}/${prefs.length} 行`);

  const digestExists = await source.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_digest_briefs' LIMIT 1
  `);
  if (digestExists.rows.length > 0) {
    await target.query('DELETE FROM email_digest_briefs');
    const { rows: briefs } = await source.query('SELECT * FROM email_digest_briefs');
    let bN = 0;
    for (const b of briefs) {
      const uid = b.end_user_id ?? b.user_id;
      const endUserId = authToEnd.get(uid) ?? uid;
      if (!endUserId) continue;
      try {
        await target.query(
          `INSERT INTO email_digest_briefs (
            id, end_user_id, digest_date, brief_html, brief_text, download_token, pdf_storage_path, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [
            b.id, endUserId, b.digest_date, b.brief_html ?? '', b.brief_text ?? '',
            b.download_token, b.pdf_storage_path, b.created_at,
          ],
        );
        bN++;
      } catch {
        /* skip */
      }
    }
    console.log(`  email_digest_briefs: ${bN}/${briefs.length} 行`);
  }

  console.log('\n=== 完成：本地行数 ===');
  const verify = await target.query(`
    SELECT 'articles' AS t, count(*)::int AS c FROM articles
    UNION ALL SELECT 'article_summary_cache', count(*)::int FROM article_summary_cache
    UNION ALL SELECT 'subscription (chrome-ainews)', count(*)::int FROM subscription sub JOIN application a ON a.id = sub.app_id WHERE a.slug = 'chrome-ainews'
    UNION ALL SELECT 'subscriptions', count(*)::int FROM subscriptions
  `);
  console.table(verify.rows);

  await source.end();
  await target.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
