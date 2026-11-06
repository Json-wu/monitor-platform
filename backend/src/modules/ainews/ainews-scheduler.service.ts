import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { OpsJobName } from '../ops/ops-job.constants';
import { OpsJobTracker } from '../ops/ops-job-tracker.service';
import { OpsRuntimeRegistry } from '../ops/ops-runtime.registry';
import { AinewsCleanupService } from './ainews-cleanup.service';
import { AinewsDigestService } from './ainews-digest.service';
import { AinewsIngestService } from './ainews-ingest.service';
import { AinewsIngestSummarizeService } from './ainews-ingest-summarize.service';
import {
  cronEveryMinutes,
  parseIntervalMinutes,
} from './ainews-scheduler.util';
import { env } from './lib/env';

const INGEST_JOB = 'ainews-ingest';
const SUMMARIZE_JOB = 'ainews-ingest-summarize';
const RUNTIME_SOURCE = 'ainews-scheduler';

/** 单次 ingest 超过此时长仍未结束，视为卡死并强制释放内存锁（避免永久跳过）。 */
const INGEST_STALE_MS = 30 * 60 * 1000;

/**
 * RSS 入库、摘要补全、文章清理、邮件简报等定时任务。
 */
@Injectable()
export class AinewsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AinewsSchedulerService.name);
  private ingestRunning = false;
  private ingestStartedAt: number | null = null;
  private summarizeRunning = false;
  private summarizeStartedAt: number | null = null;
  private digestRunning = false;
  private digestStartedAt: number | null = null;
  private cleanupRunning = false;
  private cleanupStartedAt: number | null = null;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly ingest: AinewsIngestService,
    private readonly summarize: AinewsIngestSummarizeService,
    private readonly digest: AinewsDigestService,
    private readonly cleanup: AinewsCleanupService,
    private readonly opsTracker: OpsJobTracker,
    private readonly opsRuntime: OpsRuntimeRegistry,
  ) {}

  onModuleInit() {
    this.opsRuntime.register(RUNTIME_SOURCE, () => this.getRuntimeSnapshot());

    if (process.env.DISABLE_AINEWS_SCHEDULER === '1') {
      this.logger.log('AINEWS scheduler disabled (DISABLE_AINEWS_SCHEDULER=1)');
      return;
    }

    const ingestMinutes = parseIntervalMinutes(
      env('AINEWS_INGEST_INTERVAL_MINUTES'),
      5,
    );
    this.registerIntervalJob(
      INGEST_JOB,
      ingestMinutes,
      () => this.ingestTick(),
    );

    const summarizeMinutes = parseIntervalMinutes(
      env('AINEWS_INGEST_SUMMARIZE_INTERVAL_MINUTES'),
      15,
    );
    this.registerIntervalJob(
      SUMMARIZE_JOB,
      summarizeMinutes,
      () => this.summarizeTick(),
    );
  }

  onModuleDestroy() {
    this.opsRuntime.unregister(RUNTIME_SOURCE);
  }

  getRuntimeSnapshot() {
    const schedulerDisabled = process.env.DISABLE_AINEWS_SCHEDULER === '1';
    const iso = (ms: number | null) =>
      ms != null ? new Date(ms).toISOString() : null;
    return [
      {
        jobName: OpsJobName.AinewsIngest,
        enabled: !schedulerDisabled && env('AINEWS_INGEST_ENABLED') === '1',
        running: this.ingestRunning,
        startedAt: iso(this.ingestStartedAt),
        note:
          this.ingestRunning && this.ingestStartedAt
            ? `elapsed=${Math.round((Date.now() - this.ingestStartedAt) / 1000)}s`
            : undefined,
      },
      {
        jobName: OpsJobName.AinewsIngestSummarize,
        enabled:
          !schedulerDisabled && env('AINEWS_INGEST_SUMMARIZE_ENABLED') === '1',
        running: this.summarizeRunning,
        startedAt: iso(this.summarizeStartedAt),
      },
      {
        jobName: OpsJobName.AinewsDigest,
        enabled:
          !schedulerDisabled && env('AINEWS_EMAIL_DIGEST_ENABLED') === '1',
        running: this.digestRunning,
        startedAt: iso(this.digestStartedAt),
      },
      {
        jobName: OpsJobName.AinewsCleanup,
        enabled: !schedulerDisabled && env('AINEWS_CLEANUP_ENABLED') === '1',
        running: this.cleanupRunning,
        startedAt: iso(this.cleanupStartedAt),
      },
    ];
  }

  private registerIntervalJob(
    name: string,
    minutes: number,
    handler: () => void | Promise<void>,
  ) {
    const cronExpr = cronEveryMinutes(minutes);
    const job = new CronJob(cronExpr, () => {
      void handler();
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`registered ${name}: every ${minutes}m (${cronExpr})`);
  }

  async ingestTick() {
    if (env('AINEWS_INGEST_ENABLED') !== '1') {
      await this.opsTracker.skip(OpsJobName.AinewsIngest, 'disabled');
      return;
    }
    if (this.ingestRunning) {
      const started = this.ingestStartedAt ?? Date.now();
      const elapsedMs = Date.now() - started;
      if (elapsedMs < INGEST_STALE_MS) {
        this.logger.warn(
          `ingest skipped: previous run still in progress (${Math.round(elapsedMs / 1000)}s)`,
        );
        await this.opsTracker.skip(
          OpsJobName.AinewsIngest,
          `already_running:${Math.round(elapsedMs / 1000)}s`,
        );
        return;
      }
      this.logger.error(
        `ingest lock stale after ${Math.round(elapsedMs / 1000)}s, force releasing`,
      );
      this.ingestRunning = false;
      this.ingestStartedAt = null;
    }
    this.ingestRunning = true;
    this.ingestStartedAt = Date.now();
    const runId = await this.opsTracker.start(OpsJobName.AinewsIngest);
    try {
      const result = await this.ingest.runIngest();
      const qs = result.quickSummarize;
      const summary = `parsed=${result.parsed} new=${result.newArticles} images=${result.articleImagesFetched} quickSummarize=${qs?.processed ?? 0}/${qs?.queued ?? 0}${qs?.skippedReason ? ` (${qs.skippedReason})` : ''}`;
      await this.opsTracker.success(runId, summary, {
        parsed: result.parsed,
        newArticles: result.newArticles,
        articleImagesFetched: result.articleImagesFetched,
      });
    } catch (e) {
      this.logger.error(`ingest failed: ${String(e)}`);
      await this.opsTracker.fail(runId, e);
    } finally {
      this.ingestRunning = false;
      this.ingestStartedAt = null;
    }
  }

  async summarizeTick() {
    if (env('AINEWS_INGEST_SUMMARIZE_ENABLED') !== '1') {
      await this.opsTracker.skip(OpsJobName.AinewsIngestSummarize, 'disabled');
      return;
    }
    if (this.summarizeRunning) {
      await this.opsTracker.skip(
        OpsJobName.AinewsIngestSummarize,
        'already_running',
      );
      return;
    }
    this.summarizeRunning = true;
    this.summarizeStartedAt = Date.now();
    const runId = await this.opsTracker.start(OpsJobName.AinewsIngestSummarize);
    try {
      const result = await this.summarize.runBatchSummarize();
      await this.opsTracker.success(
        runId,
        `scanned=${result.articlesScanned} missing=${result.missingFound} processed=${result.llmProcessed} cacheRows=${result.localeCacheRows}`,
        {
          articlesScanned: result.articlesScanned,
          missingFound: result.missingFound,
          llmProcessed: result.llmProcessed,
          localeCacheRows: result.localeCacheRows,
          reason: result.reason ?? null,
        },
      );
    } catch (e) {
      this.logger.error(`ingest-summarize failed: ${String(e)}`);
      await this.opsTracker.fail(runId, e);
    } finally {
      this.summarizeRunning = false;
      this.summarizeStartedAt = null;
    }
  }

  /** 每小时检查是否处于用户本地 22:00 发送窗口 */
  @Cron('0 * * * *', { disabled: process.env.DISABLE_AINEWS_SCHEDULER === '1' })
  async digestTick() {
    if (env('AINEWS_EMAIL_DIGEST_ENABLED') !== '1') {
      await this.opsTracker.skip(OpsJobName.AinewsDigest, 'disabled');
      return;
    }
    if (this.digestRunning) {
      await this.opsTracker.skip(OpsJobName.AinewsDigest, 'already_running');
      return;
    }
    this.digestRunning = true;
    this.digestStartedAt = Date.now();
    const runId = await this.opsTracker.start(OpsJobName.AinewsDigest);
    try {
      const result = await this.digest.runDigest();
      await this.opsTracker.success(
        runId,
        `sent=${result.sent} daily=${result.sentDaily} trial=${result.sentTrial} skipped=${result.skipped}`,
        {
          sent: result.sent,
          sentDaily: result.sentDaily,
          sentTrial: result.sentTrial,
          skipped: result.skipped,
          checked: result.checked,
        },
      );
    } catch (e) {
      this.logger.error(`digest failed: ${String(e)}`);
      await this.opsTracker.fail(runId, e);
    } finally {
      this.digestRunning = false;
      this.digestStartedAt = null;
    }
  }

  @Cron('15 3 * * *', { disabled: process.env.DISABLE_AINEWS_SCHEDULER === '1' })
  async cleanupTick() {
    if (env('AINEWS_CLEANUP_ENABLED') !== '1') {
      await this.opsTracker.skip(OpsJobName.AinewsCleanup, 'disabled');
      return;
    }
    if (this.cleanupRunning) {
      await this.opsTracker.skip(OpsJobName.AinewsCleanup, 'already_running');
      return;
    }
    this.cleanupRunning = true;
    this.cleanupStartedAt = Date.now();
    const runId = await this.opsTracker.start(OpsJobName.AinewsCleanup);
    try {
      const result = await this.cleanup.runCleanup();
      await this.opsTracker.success(
        runId,
        `retention=${result.retentionDays}d articles=${result.articlesDeleted} cache=${result.cacheDeleted}`,
        {
          retentionDays: result.retentionDays,
          articlesDeleted: result.articlesDeleted,
          cacheDeleted: result.cacheDeleted,
        },
      );
    } catch (e) {
      this.logger.error(`cleanup failed: ${String(e)}`);
      await this.opsTracker.fail(runId, e);
    } finally {
      this.cleanupRunning = false;
      this.cleanupStartedAt = null;
    }
  }
}
