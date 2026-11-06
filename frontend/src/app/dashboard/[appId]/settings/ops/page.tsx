"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { SystemSettingsGuard } from "@/components/system-settings-guard";
import { SectionCard } from "@/components/section-card";
import { Pagination } from "@/components/ui/pagination";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { useShowApiError } from "@/lib/show-api-error";

type OpsJobRun = {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: string;
  error: string | null;
};

type OpsOverview = {
  checkedAt: string;
  process: {
    pid: number;
    uptimeSec: number;
    nodeVersion: string;
    rssMb: number;
    heapUsedMb: number;
  };
  database: { ok: boolean; latencyMs: number; error?: string };
  deps: {
    deepseekConfigured: boolean;
    resendConfigured: boolean;
    ainewsSchedulerDisabled: boolean;
    creditSchedulerDisabled: boolean;
    ainewsIngestEnabled: boolean;
    ainewsSummarizeEnabled: boolean;
    ainewsDigestEnabled: boolean;
    ainewsCleanupEnabled: boolean;
  };
  jobs: Array<{
    jobName: string;
    label: string;
    description: string;
    enabled: boolean;
    running: boolean;
    startedAt: string | null;
    note?: string;
    latestRun: OpsJobRun | null;
  }>;
};

const JOB_OPTIONS = [
  { value: "ainews-ingest", label: "RSS 入库" },
  { value: "ainews-ingest-summarize", label: "摘要补全" },
  { value: "ainews-digest", label: "邮件简报" },
  { value: "ainews-cleanup", label: "文章清理" },
  { value: "credit-utc-midnight", label: "积分午夜任务" },
];

const STATUS_OPTIONS = [
  { value: "running", label: "运行中" },
  { value: "success", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "skipped", label: "跳过" },
];

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "bg-red-500/15 text-red-700 dark:text-red-300",
    skipped: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? "badge"}`}
    >
      {status}
    </span>
  );
}

function BoolPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-slate-500/15 text-slate-600 dark:text-slate-300"
      }`}
    >
      {label}: {ok ? "开" : "关"}
    </span>
  );
}

function OpsContent() {
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [runs, setRuns] = useState<OpsJobRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [jobFilter, setJobFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const showApiError = useShowApiError();

  const loadOverview = useCallback(async () => {
    try {
      const res = await apiGet<OpsOverview>("/ops/overview");
      setOverview(res);
    } catch (err) {
      showApiError(err);
    }
  }, [showApiError]);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      let path = `/ops/job-runs?page=${page}&limit=${limit}`;
      if (jobFilter) path += `&jobName=${encodeURIComponent(jobFilter)}`;
      if (statusFilter) path += `&status=${encodeURIComponent(statusFilter)}`;
      const res = await apiGet<{ data: OpsJobRun[]; total: number }>(path);
      setRuns(res.data);
      setTotal(res.total);
    } catch (err) {
      showApiError(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, jobFilter, statusFilter, showApiError]);

  useEffect(() => {
    void loadOverview();
    const id = window.setInterval(() => {
      void loadOverview();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [loadOverview]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function handleRefresh() {
    await Promise.all([loadOverview(), loadRuns()]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">运维监控</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            进程自检、依赖开关与定时任务执行状态；概览每 15 秒自动刷新。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary inline-flex items-center gap-2"
          onClick={() => void handleRefresh()}
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </button>
      </div>

      <SectionCard
        title="服务状态"
        description={
          overview
            ? `检测于 ${new Date(overview.checkedAt).toLocaleString()}`
            : "加载中…"
        }
      >
        {!overview ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                  overview.database.ok
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-red-500/15 text-red-700 dark:text-red-300"
                }`}
              >
                DB {overview.database.ok ? "正常" : "异常"} (
                {overview.database.latencyMs}ms)
              </span>
              <span className="badge">uptime {formatUptime(overview.process.uptimeSec)}</span>
              <span className="badge">pid {overview.process.pid}</span>
              <span className="badge">{overview.process.nodeVersion}</span>
              <span className="badge">
                rss {overview.process.rssMb}MB / heap {overview.process.heapUsedMb}MB
              </span>
            </div>
            {overview.database.error ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {overview.database.error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <BoolPill ok={overview.deps.deepseekConfigured} label="DeepSeek" />
              <BoolPill ok={overview.deps.resendConfigured} label="Resend" />
              <BoolPill
                ok={!overview.deps.ainewsSchedulerDisabled}
                label="Ainews 调度器"
              />
              <BoolPill
                ok={!overview.deps.creditSchedulerDisabled}
                label="积分调度器"
              />
              <BoolPill ok={overview.deps.ainewsIngestEnabled} label="Ingest" />
              <BoolPill ok={overview.deps.ainewsSummarizeEnabled} label="Summarize" />
              <BoolPill ok={overview.deps.ainewsDigestEnabled} label="Digest" />
              <BoolPill ok={overview.deps.ainewsCleanupEnabled} label="Cleanup" />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="定时任务" description="启用状态、是否在跑、最近一次执行">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>任务</th>
                <th>启用</th>
                <th>运行中</th>
                <th>上次状态</th>
                <th>上次时间</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              {!overview || overview.jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground">
                    暂无任务
                  </td>
                </tr>
              ) : (
                overview.jobs.map((j) => (
                  <tr key={j.jobName}>
                    <td>
                      <div className="text-sm font-medium">{j.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {j.jobName}
                        {j.note ? ` · ${j.note}` : ""}
                      </div>
                    </td>
                    <td>{j.enabled ? "是" : "否"}</td>
                    <td>
                      {j.running ? (
                        <span className="inline-flex rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          running
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {j.latestRun ? statusBadge(j.latestRun.status) : "—"}
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {j.latestRun
                        ? new Date(j.latestRun.startedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td
                      className="max-w-[280px] truncate text-sm"
                      title={j.latestRun?.error || j.latestRun?.summary || ""}
                    >
                      {j.latestRun?.error || j.latestRun?.summary || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SearchFilterBar
        search=""
        onSearchChange={() => undefined}
        onSubmit={() => undefined}
        loading={loading}
        hideSearch
        filters={[
          {
            key: "jobName",
            label: "任务",
            value: jobFilter,
            options: JOB_OPTIONS,
            onChange: (v) => {
              setJobFilter(v);
              setPage(1);
            },
          },
          {
            key: "status",
            label: "状态",
            value: statusFilter,
            options: STATUS_OPTIONS,
            onChange: (v) => {
              setStatusFilter(v);
              setPage(1);
            },
          },
        ]}
      />

      <SectionCard title="执行历史" description={`共 ${total} 条`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>开始时间</th>
                <th>任务</th>
                <th>状态</th>
                <th>耗时</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground">
                    暂无记录
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.startedAt).toLocaleString()}
                    </td>
                    <td className="text-sm">{r.jobName}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td className="text-sm text-muted-foreground">
                      {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                    </td>
                    <td
                      className="max-w-[360px] truncate text-sm"
                      title={r.error || r.summary}
                    >
                      {r.error || r.summary || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onChange={setPage}
          onLimitChange={(n) => {
            setLimit(n);
            setPage(1);
          }}
        />
      </SectionCard>
    </div>
  );
}

export default function OpsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  return (
    <SystemSettingsGuard appId={appId}>
      <OpsContent />
    </SystemSettingsGuard>
  );
}
