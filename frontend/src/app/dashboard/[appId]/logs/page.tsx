"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGetScoped } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { Pagination } from "@/components/ui/pagination";

interface EndUserAuditRow {
  id: string;
  module: string;
  action: string;
  summary: string;
  ipAddress: string;
  createdAt: string;
  actorAdminEmail: string | null;
  endUser: { id: string; email: string; name: string | null };
}

interface ClientSiteRow {
  id: string;
  visitorId: string;
  category: string;
  action: string;
  label: string | null;
  summary: string;
  ipAddress: string;
  createdAt: string;
  endUser: { id: string; email: string; name: string | null } | null;
}

export default function LogsPage() {
  const app = useCurrentApp();
  const [source, setSource] = useState<"crm" | "site">("crm");

  const [logs, setLogs] = useState<EndUserAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("");

  const [siteLogs, setSiteLogs] = useState<ClientSiteRow[]>([]);
  const [siteTotal, setSiteTotal] = useState(0);
  const [sitePage, setSitePage] = useState(1);
  const [catFilter, setCatFilter] = useState("");

  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(10);

  const loadCrm = useCallback(async () => {
    try {
      let path = `/audit-logs?page=${page}&limit=${limit}`;
      if (moduleFilter) path += `&module=${encodeURIComponent(moduleFilter)}`;
      const res = await apiGetScoped<{ data: EndUserAuditRow[]; total: number }>(path, app.id);
      setLogs(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [app.id, page, moduleFilter, limit]);

  const loadSite = useCallback(async () => {
    try {
      let path = `/client-activity-logs?page=${sitePage}&limit=${limit}`;
      if (catFilter) path += `&category=${encodeURIComponent(catFilter)}`;
      const res = await apiGetScoped<{ data: ClientSiteRow[]; total: number }>(path, app.id);
      setSiteLogs(res.data);
      setSiteTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载站点日志失败");
    }
  }, [app.id, sitePage, catFilter, limit]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setError("");
      if (source === "crm") void loadCrm();
      else void loadSite();
    }, 0);
    return () => window.clearTimeout(t);
  }, [source, loadCrm, loadSite]);

  const filtered =
    source === "crm"
      ? search
        ? logs.filter(
            (l) =>
              l.summary.toLowerCase().includes(search.toLowerCase()) ||
              l.endUser.email.toLowerCase().includes(search.toLowerCase()) ||
              (l.actorAdminEmail && l.actorAdminEmail.toLowerCase().includes(search.toLowerCase())),
          )
        : logs
      : search
        ? siteLogs.filter(
            (l) =>
              l.summary.toLowerCase().includes(search.toLowerCase()) ||
              l.visitorId.toLowerCase().includes(search.toLowerCase()) ||
              l.action.toLowerCase().includes(search.toLowerCase()) ||
              (l.endUser?.email && l.endUser.email.toLowerCase().includes(search.toLowerCase())),
          )
        : siteLogs;

  const moduleOptions = [
    { value: "users", label: "用户" },
    { value: "credits", label: "积分" },
  ];

  const categoryOptions = [
    { value: "auth", label: "认证" },
    { value: "removal", label: "抠图" },
    { value: "ui", label: "界面" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">终端用户活动</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          作用域：{app.name}。CRM 审计为后台对用户操作记录；站点行为为官网/匿名访客上报。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            source === "crm"
              ? "bg-accent text-accent-foreground"
              : "border border-border text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => {
            setSource("crm");
            setPage(1);
          }}
        >
          CRM 审计
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            source === "site"
              ? "bg-accent text-accent-foreground"
              : "border border-border text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => {
            setSource("site");
            setSitePage(1);
          }}
        >
          站点行为
        </button>
      </div>

      {error ? <div className="card p-4 text-sm text-red-400">{error}</div> : null}

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        onSubmit={() => {
          setPage(1);
          setSitePage(1);
        }}
        filters={
          source === "crm"
            ? [
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
              ]
            : [
                {
                  key: "category",
                  label: "分类",
                  value: catFilter,
                  options: categoryOptions,
                  onChange: (v) => {
                    setCatFilter(v);
                    setSitePage(1);
                  },
                },
              ]
        }
      />

      {source === "crm" ? (
        <SectionCard title="CRM 审计日志" description={`共 ${total} 条`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模块</th>
                  <th>操作</th>
                  <th>摘要</th>
                  <th>终端用户</th>
                  <th>操作人（管理员）</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted-foreground">
                      暂无日志
                    </td>
                  </tr>
                ) : (
                  (filtered as EndUserAuditRow[]).map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <span className="badge">{l.module}</span>
                      </td>
                      <td className="text-sm">{l.action}</td>
                      <td className="max-w-[220px] truncate text-sm">{l.summary}</td>
                      <td className="text-sm">{l.endUser.email}</td>
                      <td className="text-sm text-muted-foreground">{l.actorAdminEmail ?? "—"}</td>
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
              setSitePage(1);
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard title="站点 / 客户端事件" description={`共 ${siteTotal} 条`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>分类</th>
                  <th>操作</th>
                  <th>标签</th>
                  <th>摘要</th>
                  <th>访客</th>
                  <th>用户</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground">
                      暂无站点事件
                    </td>
                  </tr>
                ) : (
                  (filtered as ClientSiteRow[]).map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <span className="badge">{l.category}</span>
                      </td>
                      <td className="max-w-[120px] truncate font-mono text-xs">{l.action}</td>
                      <td className="max-w-[100px] truncate text-xs text-muted-foreground">
                        {l.label ?? "—"}
                      </td>
                      <td className="max-w-[200px] truncate text-sm">{l.summary}</td>
                      <td className="max-w-[100px] truncate font-mono text-xs" title={l.visitorId}>
                        {l.visitorId.slice(0, 8)}…
                      </td>
                      <td className="text-xs">{l.endUser?.email ?? "—"}</td>
                      <td className="font-mono text-xs text-muted-foreground">{l.ipAddress}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={sitePage}
            limit={limit}
            total={siteTotal}
            onChange={setSitePage}
            onLimitChange={(n) => {
              setLimit(n);
              setPage(1);
              setSitePage(1);
            }}
          />
        </SectionCard>
      )}
    </div>
  );
}
