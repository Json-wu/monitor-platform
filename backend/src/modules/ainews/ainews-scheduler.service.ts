import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
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

/**
 * RSS 入库、摘要补全、文章清理、邮件简报等定时任务。
 */
@Injectable()
export class AinewsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AinewsSchedulerService.name);
  private ingestRunning = false;
  private summarizeRunning = false;
  private digestRunning = false;
  private cleanupRunning = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly ingest: AinewsIngestService,
    private readonly summarize: AinewsIngestSummarizeService,
    private readonly digest: AinewsDigestService,
    private readonly cleanup: AinewsCleanupService,
  ) {}

  onModuleInit() {
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
      return;
    }
    if (this.ingestRunning) {
      return;
    }
    this.ingestRunning = true;
    try {
      await this.ingest.runIngest();
    } catch (e) {
      this.logger.error(`ingest failed: ${String(e)}`);
    } finally {
      this.ingestRunning = false;
    }
  }

  async summarizeTick() {
    if (env('AINEWS_INGEST_SUMMARIZE_ENABLED') !== '1') {
      return;
    }
    if (this.summarizeRunning) {
      return;
    }
    this.summarizeRunning = true;
    try {
      await this.summarize.runBatchSummarize();
    } catch (e) {
      this.logger.error(`ingest-summarize failed: ${String(e)}`);
    } finally {
      this.summarizeRunning = false;
    }
  }

  /** 每小时检查是否处于用户本地 22:00 发送窗口 */
  @Cron('0 * * * *', { disabled: process.env.DISABLE_AINEWS_SCHEDULER === '1' })
  async digestTick() {
    if (env('AINEWS_EMAIL_DIGEST_ENABLED') !== '1') {
      return;
    }
    if (this.digestRunning) {
      return;
    }
    this.digestRunning = true;
    try {
      await this.digest.runDigest();
    } catch (e) {
      this.logger.error(`digest failed: ${String(e)}`);
    } finally {
      this.digestRunning = false;
    }
  }

  @Cron('15 3 * * *', { disabled: process.env.DISABLE_AINEWS_SCHEDULER === '1' })
  async cleanupTick() {
    if (env('AINEWS_CLEANUP_ENABLED') !== '1') {
      return;
    }
    if (this.cleanupRunning) {
      return;
    }
    this.cleanupRunning = true;
    try {
      await this.cleanup.runCleanup();
    } catch (e) {
      this.logger.error(`cleanup failed: ${String(e)}`);
    } finally {
      this.cleanupRunning = false;
    }
  }
}
