"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Role {
  id: string;
  name: string;
  displayName: string;
  permissions: Record<string, string[]>;
  isSystem: boolean;
  userCount: number;
}

const MODULES = [
  "apps",
  "users",
  "credits",
  "orders",
  "pricing",
  "audit",
  "analytics",
  "notifications",
  "config",
  "system_logs",
  "admins",
  "roles",
];

const ACTIONS = ["view", "create", "edit", "delete", "export", "refund"];

const MODULE_LABELS: Record<string, string> = {
  apps: "应用",
  users: "用户",
  credits: "积分",
  orders: "订单",
  pricing: "定价",
  audit: "审计",
  analytics: "分析",
  notifications: "通知",
  config: "配置",
  system_logs: "系统日志",
  admins: "管理员",
  roles: "角色",
};

const ACTION_LABELS: Record<string, string> = {
  view: "查看",
  create: "新建",
  edit: "编辑",
  delete: "删除",
  export: "导出",
  refund: "退款",
};

const emptyForm = { name: "", displayName: "", permissions: {} as Record<string, string[]> };

export function RolesSettingsPanel() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ data: Role[] }>("/roles");
      setRoles(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(r: Role) {
    setEditing(r);
    setForm({
      name: r.name,
      displayName: r.displayName,
      permissions: { ...r.permissions },
    });
    setModalOpen(true);
  }

  function togglePerm(mod: string, action: string) {
    setForm((f) => {
      const current = f.permissions[mod] ?? [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return {
        ...f,
        permissions: { ...f.permissions, [mod]: next },
      };
    });
  }

  function hasPerm(mod: string, action: string) {
    return form.permissions[mod]?.includes(action) ?? false;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cleanPerms: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(form.permissions)) {
        if (v.length > 0) cleanPerms[k] = v;
      }
      if (editing) {
        await apiPut(`/roles/${editing.id}`, {
          displayName: form.displayName,
          permissions: cleanPerms,
        });
      } else {
        await apiPost("/roles", {
          name: form.name,
          displayName: form.displayName,
          permissions: cleanPerms,
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/roles/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">角色与权限</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          定义角色并按模块配置细粒度权限。
        </p>
      </div>

      {error ? <div className="card p-4 text-sm text-red-400">{error}</div> : null}

      <SectionCard title="角色" description={`共 ${roles.length} 个`}>
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn btn-primary btn-sm gap-2" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> 新建角色
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>标识</th>
                <th>显示名称</th>
                <th>类型</th>
                <th>用户数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-sm">{r.name}</td>
                  <td className="font-medium">{r.displayName}</td>
                  <td>
                    {r.isSystem ? (
                      <span className="badge badge-warn">系统</span>
                    ) : (
                      <span className="badge">自定义</span>
                    )}
                  </td>
                  <td>{r.userCount}</td>
                  <td>
                    <div className="flex gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!r.isSystem ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-red-400"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `编辑：${editing.displayName}` : "新建角色"} wide>
        <div className="space-y-4">
          {!editing ? (
            <FormField label="标识" hint="唯一标识（建议 snake_case）">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="custom_role"
              />
            </FormField>
          ) : null}
          <FormField label="显示名称">
            <input
              className="input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="自定义角色"
            />
          </FormField>

          <div>
            <label className="mb-2 block text-sm font-medium">权限矩阵</label>
            <div className="overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                      模块
                    </th>
                    {ACTIONS.map((a) => (
                      <th
                        key={a}
                        className="px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground"
                      >
                        {ACTION_LABELS[a] ?? a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((mod) => (
                    <tr key={mod} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-medium">{MODULE_LABELS[mod] ?? mod}</td>
                      {ACTIONS.map((act) => (
                        <td key={act} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={hasPerm(mod, act)}
                            onChange={() => togglePerm(mod, act)}
                            className="accent-accent"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !form.displayName}
          >
            {saving ? "保存中…" : editing ? "更新" : "创建"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除角色"
        message={`确定删除「${deleteTarget?.displayName}」？已分配该角色的管理员将失去对应权限。`}
        confirmLabel="删除"
        danger
      />
    </div>
  );
}
