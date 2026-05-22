"use client";

import { useCallback, useEffect, useState } from "react";
import { Key, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { useAppliedSearch, useSearchLoading } from "@/lib/use-applied-search";
import { Pagination } from "@/components/ui/pagination";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useShowApiError } from "@/lib/show-api-error";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
  allowedApps: string[];
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string; displayName: string };
}

interface Role {
  id: string;
  name: string;
  displayName: string;
}

interface App {
  id: string;
  name: string;
  slug: string;
}

const emptyForm = { email: "", name: "", password: "", roleId: "", allowedApps: [] as string[] };

export function AdminsSettingsPanel() {
  const showApiError = useShowApiError();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { searchDraft, setSearchDraft, appliedSearch, searchToken, applySearch } =
    useAppliedSearch();
  const { searchLoading, startSearchLoad, finishSearchLoad } = useSearchLoading();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [pwdTarget, setPwdTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, r, ap] = await Promise.all([
        apiGet<{ data: AdminUser[]; total: number }>(
          `/admins?page=${page}&limit=${limit}${appliedSearch ? `&search=${encodeURIComponent(appliedSearch)}` : ""}`,
        ),
        apiGet<{ data: Role[] }>("/roles"),
        apiGet<{ data: App[] }>("/apps"),
      ]);
      setAdmins(a.data);
      setTotal(a.total);
      setRoles(r.data);
      setApps(ap.data);
    } catch (err) {
      showApiError(err);
    } finally {
      finishSearchLoad();
    }
  }, [page, appliedSearch, searchToken, limit, showApiError, finishSearchLoad]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit() {
    startSearchLoad();
    applySearch();
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, roleId: roles[0]?.id ?? "" });
    setModalOpen(true);
  }

  function openEdit(a: AdminUser) {
    setEditing(a);
    setForm({
      email: a.email,
      name: a.name,
      password: "",
      roleId: a.role.id,
      allowedApps: a.allowedApps,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        await apiPut(`/admins/${editing.id}`, {
          name: form.name,
          roleId: form.roleId,
          allowedApps: form.allowedApps,
        });
      } else {
        await apiPost("/admins", form);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: AdminUser) {
    try {
      await apiPut(`/admins/${a.id}`, { isActive: !a.isActive });
      await load();
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/admins/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleResetPassword() {
    if (!pwdTarget || !newPassword) return;
    setSaving(true);
    try {
      await apiPost(`/admins/${pwdTarget.id}/reset-password`, { password: newPassword });
      setPwdTarget(null);
      setNewPassword("");
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  function toggleApp(appId: string) {
    setForm((f) => ({
      ...f,
      allowedApps: f.allowedApps.includes(appId)
        ? f.allowedApps.filter((id) => id !== appId)
        : [...f.allowedApps, appId],
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">管理员</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          管理系统管理员账号及其权限范围。
        </p>
      </div>

      <SearchFilterBar
        search={searchDraft}
        onSearchChange={setSearchDraft}
        onSubmit={handleSearchSubmit}
        loading={searchLoading}
      />

      <SectionCard title="管理员" description={`共 ${total} 人`}>
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn btn-primary btn-sm gap-2" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> 新建管理员
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>邮箱</th>
                <th>姓名</th>
                <th>角色</th>
                <th>状态</th>
                <th>可访问应用</th>
                <th>上次登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    暂无管理员
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.email}</td>
                    <td>{a.name}</td>
                    <td>
                      <span className="badge">{a.role.displayName}</span>
                    </td>
                    <td>
                      <span className={`badge ${a.isActive ? "badge-success" : "badge-error"}`}>
                        {a.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="text-xs">
                      {a.allowedApps.length === 0 ? (
                        <span className="text-muted-foreground">All</span>
                      ) : (
                        `${a.allowedApps.length} apps`
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="编辑"
                          onClick={() => openEdit(a)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title={a.isActive ? "停用" : "启用"}
                          onClick={() => toggleActive(a)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="重置密码"
                          onClick={() => {
                            setPwdTarget(a);
                            setNewPassword("");
                          }}
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-red-400"
                          title="删除"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `编辑：${editing.name}` : "新建管理员"}
      >
        <div className="space-y-4">
          {!editing ? (
            <FormField label="邮箱">
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@example.com"
              />
            </FormField>
          ) : null}
          <FormField label="姓名">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="John Doe"
            />
          </FormField>
          {!editing ? (
            <FormField label="密码" hint="至少 6 位">
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </FormField>
          ) : null}
          <FormField label="角色">
            <select
              className="input"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            >
              <option value="">选择角色</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="可访问应用" hint="不勾选任何项表示可访问全部应用">
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {apps.map((app) => (
                <label key={app.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowedApps.includes(app.id)}
                    onChange={() => toggleApp(app.id)}
                    className="accent-accent"
                  />
                  {app.name}{" "}
                  <span className="text-xs text-muted-foreground">({app.slug})</span>
                </label>
              ))}
              {apps.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无应用</p>
              ) : null}
            </div>
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !form.name || !form.roleId}
          >
            {saving ? "保存中…" : editing ? "更新" : "创建"}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!pwdTarget}
        onClose={() => setPwdTarget(null)}
        title={`重置密码 — ${pwdTarget?.email ?? ""}`}
      >
        <FormField label="新密码" hint="至少 6 位">
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </FormField>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPwdTarget(null)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleResetPassword}
            disabled={saving || newPassword.length < 6}
          >
            {saving ? "提交中…" : "重置密码"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除管理员"
        message={`确定删除「${deleteTarget?.email}」？此操作不可恢复。`}
        confirmLabel="删除"
        danger
      />
    </div>
  );
}
