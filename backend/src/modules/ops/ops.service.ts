import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OPS_JOB_DEFS, type OpsJobNameValue } from './ops-job.constants';
import { OpsRuntimeRegistry } from './ops-runtime.registry';

function envOn(key: string): boolean {
  return process.env[key] === '1';
}

function envConfigured(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: OpsRuntimeRegistry,
  ) {}

  async overview() {
    const [database, latestByJob] = await Promise.all([
      this.checkDatabase(),
      this.latestRunsByJob(),
    ]);
    const runtimeMap = new Map(
      this.runtime.list().map((s) => [s.jobName, s] as const),
    );

    const jobs = OPS_JOB_DEFS.map((def) => {
      const snap = runtimeMap.get(def.jobName);
      const latest = latestByJob.get(def.jobName) ?? null;
      return {
        ...def,
        enabled: snap?.enabled ?? this.defaultEnabled(def.jobName),
        running: snap?.running ?? false,
        startedAt: snap?.startedAt ?? null,
        note: snap?.note,
        latestRun: latest,
      };
    });

    const mem = process.memoryUsage();
    return {
      checkedAt: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        nodeVersion: process.version,
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      database,
      deps: {
        deepseekConfigured: envConfigured('DEEPSEEK_API_KEY'),
        resendConfigured: envConfigured('RESEND_API_KEY'),
        ainewsSchedulerDisabled: envOn('DISABLE_AINEWS_SCHEDULER'),
        creditSchedulerDisabled: envOn('DISABLE_CREDIT_SCHEDULER'),
        ainewsIngestEnabled: envOn('AINEWS_INGEST_ENABLED'),
        ainewsSummarizeEnabled: envOn('AINEWS_INGEST_SUMMARIZE_ENABLED'),
        ainewsDigestEnabled: envOn('AINEWS_EMAIL_DIGEST_ENABLED'),
        ainewsCleanupEnabled: envOn('AINEWS_CLEANUP_ENABLED'),
      },
      jobs,
    };
  }

  async findJobRuns(
    filters: { jobName?: string; status?: string },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.OpsJobRunWhereInput = {};
    if (filters.jobName?.trim()) {
      where.jobName = filters.jobName.trim();
    }
    if (filters.status?.trim()) {
      where.status = filters.status.trim();
    }
    const take = Math.min(100, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;
    const [data, total] = await Promise.all([
      this.prisma.opsJobRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.opsJobRun.count({ where }),
    ]);
    return { data, total, page: Math.max(1, page), limit: take };
  }

  private defaultEnabled(jobName: OpsJobNameValue): boolean {
    if (process.env.DISABLE_AINEWS_SCHEDULER === '1') {
      if (jobName.startsWith('ainews-')) return false;
    }
    if (process.env.DISABLE_CREDIT_SCHEDULER === '1') {
      if (jobName === 'credit-utc-midnight') return false;
    }
    switch (jobName) {
      case 'ainews-ingest':
        return envOn('AINEWS_INGEST_ENABLED');
      case 'ainews-ingest-summarize':
        return envOn('AINEWS_INGEST_SUMMARIZE_ENABLED');
      case 'ainews-digest':
        return envOn('AINEWS_EMAIL_DIGEST_ENABLED');
      case 'ainews-cleanup':
        return envOn('AINEWS_CLEANUP_ENABLED');
      case 'credit-utc-midnight':
        return !envOn('DISABLE_CREDIT_SCHEDULER');
      default:
        return false;
    }
  }

  private async checkDatabase(): Promise<{
    ok: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async latestRunsByJob() {
    const names = OPS_JOB_DEFS.map((d) => d.jobName);
    const rows = await this.prisma.opsJobRun.findMany({
      where: { jobName: { in: [...names] } },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!map.has(row.jobName)) {
        map.set(row.jobName, row);
      }
    }
    return map;
  }
}
