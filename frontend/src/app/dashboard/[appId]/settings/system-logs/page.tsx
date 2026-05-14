"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { SystemSettingsGuard } from "@/components/system-settings-guard";
import { SectionCard } from "@/components/section-card";
import { Pagination } from "@/components/ui/pagination";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";

interface SystemOpLog {
  id: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  adminEmail: string;
  ipAddress: string;
  createdAt: string;
  admin?: { name: string; email: string };
}

function SystemLogsContent({ appId }: { appId: string }) {
  const [logs, setLogs] = useState<SystemOpLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(10);

  const load = useCallback(async () => {
    try {
      let path = `/system-operation-logs?page=${page}&limit=${limit}&appId=${encodeURIComponent(appId)}`;
      if (moduleFilter) path += `&module=${encodeURIComponent(moduleFilter)}`;
      const res = await apiGet<{ data: SystemOpLog[]; total: number }>(path);
      setLogs(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [appId, page, moduleFilter, limit]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const filtered = search
    ? logs.filter(
        (l) =>
          l.summary.toLowerCase().includes(search.toLowerCase()) ||
          l.adminEmail.toLowerCase().includes(search.toLowerCase()) ||
          l.module.toLowerCase().includes(search.toLowerCase()),
      )
    : logs;

  const moduleOptions = [
    { value: "auth", label: "认证" },
    { value: "admin", label: "管理员" },
    { value: "role", label: "角色" },
    { value: "appregistry", label: "应用" },
    { value: "user", label: "用户（API）" },
    { value: "credit", label: "积分" },
    { value: "notification", label: "通知" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">系统活动</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          后台管理员登录、登出及写操作（新增/修改/删除等），按当前应用上下文筛选。
        </p>
      </div>

      {error ? <div className="card p-4 text-sm text-red-400">{error}</div> : null}

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        onSubmit={() => setPage(1)}
        filters={[
          {
            key: "module",
            label: "模块",
            value: moduleFilter,
            options: moduleOptions,
            onChange: (v) => {
              setModuleFilter(v);
              setPage(1);
            },
          },
        ]}
      />

      <SectionCard title="系统操作日志" description={`共 ${total} 条`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>模块</th>
                <th>操作</th>
                <th>摘要</th>
                <th>管理员</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground">
                    暂无日志
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span className="badge">{l.module}</span>
                    </td>
                    <td className="text-sm">{l.action}</td>
                    <td className="max-w-[280px] truncate text-sm">{l.summary}</td>
                    <td className="text-sm">{l.adminEmail}</td>
                    <td className="font-mono text-xs text-muted-foreground">{l.ipAddress}</td>
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

export default function SystemLogsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  return (
    <SystemSettingsGuard appId={appId}>
      <SystemLogsContent appId={appId} />
    </SystemSettingsGuard>
  );
}
