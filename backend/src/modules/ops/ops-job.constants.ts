export const OpsJobName = {
  AinewsIngest: 'ainews-ingest',
  AinewsIngestSummarize: 'ainews-ingest-summarize',
  AinewsDigest: 'ainews-digest',
  AinewsCleanup: 'ainews-cleanup',
  CreditUtcMidnight: 'credit-utc-midnight',
} as const;

export type OpsJobNameValue = (typeof OpsJobName)[keyof typeof OpsJobName];

export const OPS_JOB_DEFS: Array<{
  jobName: OpsJobNameValue;
  label: string;
  description: string;
}> = [
  {
    jobName: OpsJobName.AinewsIngest,
    label: 'AI News RSS 入库',
    description: '抓取 RSS 并写入 articles',
  },
  {
    jobName: OpsJobName.AinewsIngestSummarize,
    label: 'AI News 摘要补全',
    description: '批量补全多语言摘要缓存',
  },
  {
    jobName: OpsJobName.AinewsDigest,
    label: 'AI News 邮件简报',
    description: '用户本地 22:00 窗口发送 digest',
  },
  {
    jobName: OpsJobName.AinewsCleanup,
    label: 'AI News 文章清理',
    description: '按保留天数清理过期 articles',
  },
  {
    jobName: OpsJobName.CreditUtcMidnight,
    label: '积分 UTC 午夜任务',
    description: '每日 promo 重置 + 订阅积分过期',
  },
];

export type OpsJobRunStatus = 'running' | 'success' | 'failed' | 'skipped';

export type OpsJobRuntimeSnapshot = {
  jobName: OpsJobNameValue;
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  note?: string;
};
