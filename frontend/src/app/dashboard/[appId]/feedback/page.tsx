"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiDelete, apiGetScoped, apiPatch } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { useCurrentUser, hasPermission } from "@/lib/user-context";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { useAppliedSearch } from "@/lib/use-applied-search";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useShowApiError } from "@/lib/show-api-error";

type FeedbackStatus = "pending" | "reviewed" | "resolved" | "archived";

interface FeedbackRow {
  id: string;
  nickname: string;
  email: string;
  subject: string;
  message: string;
  status: FeedbackStatus;
  ipAddress: string | null;
  createdAt: string;
  endUser: { id: string; email: string; name: string | null } | null;
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: "待处理",
  reviewed: "已查看",
  resolved: "已解决",
  archived: "已归档",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "reviewed", label: "已查看" },
  { value: "resolved", label: "已解决" },
  { value: "archived", label: "已归档" },
];

export default function FeedbackPage() {
  const app = useCurrentApp();
  const user = useCurrentUser();
  const canEdit = hasPermission(user, "feedback:edit");
  const canDelete = hasPermission(user, "feedback:delete");
  const showApiError = useShowApiError();

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const { searchDraft, setSearchDraft, appliedSearch, applySearch } =
    useAppliedSearch();

  const [detail, setDetail] = useState<FeedbackRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedbackRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      let path = `/feedback?page=${page}&limit=${limit}`;
      if (statusFilter) path += `&status=${encodeURIComponent(statusFilter)}`;
      if (appliedSearch) path += `&search=${encodeURIComponent(appliedSearch)}`;
      const res = await apiGetScoped<{ data: FeedbackRow[]; total: number }>(
        path,
        app.id,
      );
      setRows(res.data);
      setTotal(res.total);
    } catch (err) {
      showApiError(err);
    }
  }, [app.id, page, limit, statusFilter, appliedSearch, showApiError]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function updateStatus(id: string, status: FeedbackStatus) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await apiPatch(`/feedback/${id}/status?appId=${encodeURIComponent(app.id)}`, {
        status,
      });
      await load();
      if (detail?.id === id) {
        setDetail((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !canDelete) return;
    setBusy(true);
    try {
      await apiDelete(
        `/feedback/${deleteTarget.id}?appId=${encodeURIComponent(app.id)}`,
      );
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      await load();
    } catch (err) {
      showApiError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleSearchSubmit() {
    applySearch();
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">用户反馈</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          作用域：{app.name}。应用内用户提交的疑问与建议。
        </p>
      </div>

      <SearchFilterBar
        search={searchDraft}
        onSearchChange={setSearchDraft}
        onSubmit={handleSearchSubmit}
        filters={[
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

      <SectionCard title="反馈列表" description={`共 ${total} 条`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>昵称</th>
                <th>邮箱</th>
                <th>主题</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground">
                    暂无反馈
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="text-sm">{row.nickname}</td>
                    <td className="text-sm">{row.email}</td>
                    <td className="max-w-[240px] truncate text-sm">{row.subject}</td>
                    <td>
                      <span className="badge">{STATUS_LABELS[row.status]}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => setDetail(row)}
                        >
                          查看
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                            title="删除"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
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

      <Modal
        open={!!detail}
        title={detail?.subject ?? "反馈详情"}
        onClose={() => setDetail(null)}
        wide
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">昵称</div>
                <div>{detail.nickname}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">邮箱</div>
                <div>{detail.email}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">提交时间</div>
                <div>{new Date(detail.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">IP</div>
                <div className="font-mono text-xs">{detail.ipAddress ?? "—"}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">内容</div>
              <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3">
                {detail.message}
              </div>
            </div>
            {canEdit ? (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">处理状态</div>
                <select
                  className="input"
                  value={detail.status}
                  disabled={busy}
                  onChange={(e) =>
                    void updateStatus(detail.id, e.target.value as FeedbackStatus)
                  }
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <div className="text-xs text-muted-foreground">状态</div>
                <div>{STATUS_LABELS[detail.status]}</div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除反馈"
        message={`确认删除「${deleteTarget?.subject ?? ""}」？此操作不可恢复。`}
        confirmLabel="删除"
        danger
        loading={busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
