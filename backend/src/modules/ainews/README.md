# Industry AI News（Chrome 扩展）模块

为 `chrome-ainews` 应用提供 RSS 新闻、匿名追踪、订阅档位、AI 摘要、邮件简报等 API。

## 公开 API（扩展调用）

前缀：`/api/public/ainews`（需 `@Public()`，无 Admin JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/anon/resolve` | deviceId → end_user id（设备访客） |
| GET | `/account-tier` | 档位（可选 Bearer 终端用户 JWT） |
| POST | `/link-account` | 登录后合并设备访客到 OAuth 账户 |
| POST | `/news/list` | 新闻列表 |
| POST | `/track/prefs` | 偏好快照 |
| POST | `/track/action` | 赞/踩/已读 |
| POST | `/summarize` | AI 摘要（Bearer 或 x-anon-user-id，均为 end_user id） |
| GET | `/summary-usage` | 当日摘要用量 |
| GET | `/extension-preferences` | 读取登录用户扩展偏好 |
| PUT | `/extension-preferences` | 写入登录用户扩展偏好 |
| GET | `/email-unsubscribe` | 邮件简报退订（HMAC 链接） |

终端用户登录：`/api/public/auth/*?slug=chrome-ainews`

## Gumroad

`GumroadService.handleAinewsRelayPing` 写入 `subscriptions`（插件档位）及 monitor 订单。

环境变量：

- `GUMROAD_AINEWS_APP_SLUG=chrome-ainews`
- `GUMROAD_PRODUCT_ID_PRO` / `GUMROAD_PRODUCT_ID_UNLIMITED`

## 数据库

迁移：`prisma/migrations/20260610120000_ainews_plugin/`、`20260602190000_merge_anon_users_into_end_user/`

插件 Gumroad 订阅写入平台 `subscription` 表（关联 `pricing_plan`），与 ClearBG 等应用共用管理后台订阅视图。未登录前的 Gumroad 回调暂存于 `pending_subscriptions`（按邮箱）。

参考 SQL：`prisma/ainews-reference-migrations/`（原 Supabase migrations）

## 定时任务

`AinewsSchedulerService`（Nest `@Cron` + 动态间隔）：

| 间隔 | 服务 | 环境变量 |
|------|------|----------|
| `AINEWS_INGEST_INTERVAL_MINUTES`（默认 5） | RSS ingest + 入库后即时摘要 | `AINEWS_INGEST_ENABLED=1` |
| `AINEWS_INGEST_SUMMARIZE_INTERVAL_MINUTES`（默认 15） | 批量补全缺失多语言摘要 | `AINEWS_INGEST_SUMMARIZE_ENABLED=1` |
| `0 * * * *` | 邮件简报 | `AINEWS_EMAIL_DIGEST_ENABLED=1` |
| `15 3 * * *` | 过期文章清理 | `AINEWS_CLEANUP_ENABLED=1` |

全局关闭：`DISABLE_AINEWS_SCHEDULER=1`

邮件简报还需：`RESEND_API_KEY`、`EMAIL_FROM`、`DEEPSEEK_API_KEY`；退订链接需 `EMAIL_UNSUBSCRIBE_SECRET`、`AINEWS_PUBLIC_API_URL`（或 `API_EXTERNAL_URL`）。

ingest / 摘要补全可选：`RSS_FETCH_USER_AGENT`、`INGEST_ARTICLE_IMAGE_MAX`、`INGEST_QUICK_SUMMARIZE_LIMIT`、`SUMMARIZE_LOOKBACK_DAYS`、`SUMMARIZE_SCAN_LIMIT`、`SUMMARIZE_ITEMS_PER_RUN`、`NEWS_RETENTION_DAYS`；摘要需 `DEEPSEEK_API_KEY`。

**入库摘要语言策略**：RSS 新文章入库后立即调用 LLM，**默认生成简体中文与英文**（含标题与摘要）；若数据库中存在使用其它界面语言（ja、ko、fr 等）的用户，则额外生成对应语言。定时批量补全任务（`ingest-article-summaries`）沿用同一目标语言集合。

## 从 Supabase 迁移数据（开发环境）

### 1. 导出（在旧 `industry-ai-news-plugin` 目录，若仍 link Supabase）

```bash
npx supabase db dump --linked --data-only --schema public -f /tmp/ainews-public-data.sql
```

### 2. 导入核心表（articles + 摘要缓存）

```bash
cd monitor-platform/backend
node scripts/migrate-ainews-from-dump.mjs /tmp/ainews-public-data.sql
```

### 3. 全量迁移（含 anon_users、subscriptions）

```bash
npm run db:migrate:ainews
```

### 验证

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM articles;"
curl -X POST http://localhost:4000/api/public/ainews/news/list \
  -H 'Content-Type: application/json' \
  -d '{"domains":["tech"],"locale":"zh","limit":3}'
```
