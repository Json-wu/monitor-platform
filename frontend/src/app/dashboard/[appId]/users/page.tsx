"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Pencil, Power } from "lucide-react";
import { apiGet, apiPut, apiPostScoped } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { useAppliedSearch, useSearchLoading } from "@/lib/use-applied-search";
import { Pagination } from "@/components/ui/pagination";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { useShowApiError } from "@/lib/show-api-error";

interface User {
  id: string;
  appId: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  tags: string[];
  notes: string | null;
  createdAt: string;
  app?: { id: string; name: string; slug: string } | null;
  /** 累计获得积分（入账合计） */
  totalCredits: number;
  /** 累计消耗积分 */
  creditsSpent: number;
  /** 已支付订单金额合计（充值/订阅等） */
  rechargeAmount: number;
  rechargeCurrency: string;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const statusOptions = [
  { value: "active", label: "正常" },
  { value: "suspended", label: "已暂停" },
  { value: "deleted", label: "已删除" },
];

const creditTypeOptions = [
  { value: "subscription", label: "订阅" },
  { value: "payg", label: "按量付费" },
  { value: "promo", label: "活动赠送" },
];

const userStatusDisplay: Record<string, string> = {
  active: "正常",
  suspended: "已暂停",
  deleted: "已删除",
};

export default function UsersPage() {
  const app = useCurrentApp();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const { searchDraft, setSearchDraft, appliedSearch, searchToken, applySearch } =
    useAppliedSearch();
  const { searchLoading, startSearchLoad, finishSearchLoad } = useSearchLoading();
  const [statusFilter, setStatusFilter] = useState("");
  const showApiError = useShowApiError();

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", status: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const [creditUser, setCreditUser] = useState<User | null>(null);
  const [creditForm, setCreditForm] = useState({ amount: "", creditType: "subscription", reason: "" });

  const [limit, setLimit] = useState(10);

  const loadUsers = useCallback(async () => {
    try {
      let path = `/users?page=${page}&limit=${limit}`;
      if (appliedSearch) path += `&search=${encodeURIComponent(appliedSearch)}`;
      if (statusFilter) path += `&status=${statusFilter}`;
      path += `&appId=${encodeURIComponent(app.id)}`;
      const res = await apiGet<{ data: User[]; total: number }>(path);
      setUsers(res.data);
      setTotal(res.total);
    } catch (err) {
      showApiError(err);
    } finally {
      finishSearchLoad();
    }
  }, [page, appliedSearch, searchToken, statusFilter, limit, app.id, finishSearchLoad, showApiError]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function handleSearchSubmit() {
    startSearchLoad();
    applySearch();
    setPage(1);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({ name: u.name ?? "", phone: u.phone ?? "", status: u.status, notes: u.notes ?? "" });
  }

  async function handleEditSave() {
    if (!editUser) return;
    setSaving(true);
    try {
      await apiPut(`/users/${editUser.id}`, editForm);
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(u: User) {
    const newStatus = u.status === "active" ? "suspended" : "active";
    try {
      await apiPut(`/users/${u.id}`, { status: newStatus });
      await loadUsers();
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleGrantCredits() {
    if (!creditUser) return;
    setSaving(true);
    try {
      await apiPostScoped("/credits/grant", {
        userId: creditUser.id,
        amount: Number(creditForm.amount),
        creditType: creditForm.creditType,
        reason: creditForm.reason || "管理员手动发放",
      }, creditUser.appId);
      setCreditUser(null);
      setCreditForm({ amount: "", creditType: "subscription", reason: "" });
      await loadUsers();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">终端用户</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          管理当前应用下的终端用户。
        </p>
      </div>

      <SearchFilterBar
        search={searchDraft}
        onSearchChange={setSearchDraft}
        onSubmit={handleSearchSubmit}
        loading={searchLoading}
        filters={[
          {
            key: "status",
            label: "全部状态",
            value: statusFilter,
            options: statusOptions,
            onChange: (v) => {
              setStatusFilter(v);
              setPage(1);
            },
          },
        ]}
      />

      <SectionCard title="用户" description={`共 ${total} 名`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>邮箱</th>
                <th>姓名</th>
                <th>状态</th>
                <th className="text-right">总积分</th>
                <th className="text-right">消耗积分</th>
                <th className="text-right">充值金额</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.email}</td>
                    <td>{u.name || "-"}</td>
                    <td>
                      <span
                        className={`badge ${u.status === "active" ? "badge-success" : u.status === "suspended" ? "badge-warn" : "badge-error"}`}
                      >
                        {userStatusDisplay[u.status] ?? u.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums text-sm">
                      {(u.totalCredits ?? 0).toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums text-sm text-muted-foreground">
                      {(u.creditsSpent ?? 0).toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums text-sm">
                      {formatMoney(u.rechargeAmount ?? 0, u.rechargeCurrency ?? "USD")}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="编辑"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title={u.status === "active" ? "暂停" : "启用"}
                          onClick={() => toggleStatus(u)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="发放积分"
                          onClick={() => {
                            setCreditUser(u);
                            setCreditForm({ amount: "", creditType: "subscription", reason: "" });
                          }}
                        >
                          <Coins className="h-3.5 w-3.5" />
                        </button>
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

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`编辑用户：${editUser?.email ?? ""}`}>
        <div className="space-y-4">
          <FormField label="姓名">
            <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </FormField>
          <FormField label="手机">
            <input className="input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </FormField>
          <FormField label="状态">
            <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="备注">
            <textarea className="input" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditUser(null)}>取消</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </Modal>

      {/* Grant Credits Modal */}
      <Modal open={!!creditUser} onClose={() => setCreditUser(null)} title={`发放积分 — ${creditUser?.email ?? ""}`}>
        <div className="space-y-4">
          <FormField label="数量">
            <input type="number" min="1" className="input" value={creditForm.amount} onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })} placeholder="100" />
          </FormField>
          <FormField label="积分类型">
            <select className="input" value={creditForm.creditType} onChange={(e) => setCreditForm({ ...creditForm, creditType: e.target.value })}>
              {creditTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="原因">
            <input className="input" value={creditForm.reason} onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })} placeholder="Admin manually issued credits" />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreditUser(null)}>取消</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleGrantCredits} disabled={saving || !creditForm.amount}>
            {saving ? "发放中…" : "确认发放"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
