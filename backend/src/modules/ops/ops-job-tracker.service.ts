import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { OpsJobNameValue, OpsJobRunStatus } from './ops-job.constants';

const SKIP_DEBOUNCE_MS = 60 * 60 * 1000;
const ERROR_MAX = 2000;
const SUMMARY_MAX = 500;

@Injectable()
export class OpsJobTracker {
  private readonly logger = new Logger(OpsJobTracker.name);
  private readonly lastSkipAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async start(
    jobName: OpsJobNameValue,
    metadata?: Prisma.InputJsonValue,
  ): Promise<string | null> {
    try {
      const row = await this.prisma.opsJobRun.create({
        data: {
          jobName,
          status: 'running',
          summary: '',
          ...(metadata !== undefined ? { metadata } : {}),
        },
        select: { id: true },
      });
      return row.id;
    } catch (e) {
      this.logger.warn(`ops start failed ${jobName}: ${String(e)}`);
      return null;
    }
  }

  async success(
    runId: string | null,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.finish(runId, 'success', summary, null, metadata);
  }

  async fail(
    runId: string | null,
    error: unknown,
    summary = '',
  ): Promise<void> {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : String(error);
    await this.finish(runId, 'failed', summary, msg.slice(0, ERROR_MAX));
  }

  /**
   * 记录 skipped（如功能开关关闭 / 上一轮仍在跑）。
   * 同 job+原因 1 小时内只写一条，避免刷库。
   */
  async skip(
    jobName: OpsJobNameValue,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const key = `${jobName}:${summary}`;
    const now = Date.now();
    const last = this.lastSkipAt.get(key) ?? 0;
    if (now - last < SKIP_DEBOUNCE_MS) {
      return;
    }
    this.lastSkipAt.set(key, now);
    try {
      const startedAt = new Date();
      await this.prisma.opsJobRun.create({
        data: {
          jobName,
          status: 'skipped',
          startedAt,
          finishedAt: startedAt,
          durationMs: 0,
          summary: summary.slice(0, SUMMARY_MAX),
          ...(metadata !== undefined ? { metadata } : {}),
        },
      });
    } catch (e) {
      this.logger.warn(`ops skip failed ${jobName}: ${String(e)}`);
    }
  }

  private async finish(
    runId: string | null,
    status: Extract<OpsJobRunStatus, 'success' | 'failed'>,
    summary: string,
    error: string | null,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    if (!runId) return;
    try {
      const existing = await this.prisma.opsJobRun.findUnique({
        where: { id: runId },
        select: { startedAt: true },
      });
      if (!existing) return;
      const finishedAt = new Date();
      await this.prisma.opsJobRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt,
          durationMs: Math.max(
            0,
            finishedAt.getTime() - existing.startedAt.getTime(),
          ),
          summary: summary.slice(0, SUMMARY_MAX),
          error,
          ...(metadata !== undefined ? { metadata } : {}),
        },
      });
    } catch (e) {
      this.logger.warn(`ops finish failed ${runId}: ${String(e)}`);
    }
  }
}
