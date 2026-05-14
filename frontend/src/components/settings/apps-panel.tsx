"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface App {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  environment?: string;
  description?: string | null;
  apiKey?: string;
  googleClientId?: string | null;
  createdAt: string;
}

type AppForm = {
  name: string;
  slug: string;
  domain: string;
  description: string;
  environment: string;
  googleClientId: string;
};

const emptyForm: AppForm = {
  name: "",
  slug: "",
  domain: "",
  description: "",
  environment: "production",
  googleClientId: "",
};

const appStatusLabel: Record<string, string> = {
  active: "正常",
  disabled: "已停用",
};

const appEnvironmentLabel: Record<string, string> = {
  production: "生产",
  staging: "预发",
  development: "开发",
};

export function AppsSettingsPanel() {
  const [apps, setApps] = useState<App[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<App | null>(null);
  const [form, setForm] = useState<AppForm>(emptyForm);
  /** 编辑时：用户是否改过 Google Client ID 输入框（列表/详情为脱敏，勿把脱敏串当新值提交） */
  const [googleClientIdDirty, setGoogleClientIdDirty] = useState(false);
  const [clearGoogleClientId, setClearGoogleClientId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<{
    app: App;
    action: "delete" | "toggle" | "rotate";
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ data: App[]; total: number }>(`/apps?page=${page}&limit=${limit}`);
      setApps(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [page, limit]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const filtered = search
    ? apps.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : apps;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setGoogleClientIdDirty(false);
    setClearGoogleClientId(false);
    setModalOpen(true);
  }

  function openEdit(app: App) {
    setEditing(app);
    setForm({
      name: app.name,
      slug: app.slug,
      domain: app.domain ?? "",
      description: app.description ?? "",
      environment: app.environment ?? "production",
      googleClientId: app.googleClientId ?? "",
    });
    setGoogleClientIdDirty(false);
    setClearGoogleClientId(false);
    setModalOpen(true);
  }

  async function copyApiKey(app: App) {
    if (!app.apiKey) return;
    try {
      await navigator.clipboard.writeText(app.apiKey);
      setCopiedAppId(app.id);
      window.setTimeout(() => {
        setCopiedAppId((id) => (id === app.id ? null : id));
      }, 2000);
    } catch {
      setError("复制失败，请检查浏览器剪贴板权限");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: form.name,
          domain: form.domain,
          description: form.description,
          environment: form.environment,
        };
        if (clearGoogleClientId) {
          body.googleClientId = "";
        } else if (googleClientIdDirty && form.googleClientId.trim()) {
          body.googleClientId = form.googleClientId.trim();
        }
        await apiPut(`/apps/${editing.id}`, body);
      } else {
        await apiPost("/apps", form);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    if (!confirmTarget) return;
    const { app, action } = confirmTarget;
    try {
      if (action === "delete") await apiDelete(`/apps/${app.id}`);
      else if (action === "toggle")
        await apiPut(`/apps/${app.id}`, { status: app.status === "active" ? "disabled" : "active" });
      else if (action === "rotate") await apiPost(`/apps/${app.id}/rotate-key`, {});
      setConfirmTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  }

  const cm = confirmTarget
    ? {
        delete: {
          title: "删除应用",
          msg: `确定删除「${confirmTarget.app.name}」？此操作不可恢复。`,
          label: "删除",
          danger: true,
        },
        toggle: {
          title:
            confirmTarget.app.status === "active" ? "停用应用" : "启用应用",
          msg: `确定要${confirmTarget.app.status === "active" ? "停用" : "启用"}「${confirmTarget.app.name}」？`,
          label: confirmTarget.app.status === "active" ? "停用" : "启用",
          danger: confirmTarget.app.status === "active",
        },
        rotate: {
          title: "轮换 API Key",
          msg: `确定为「${confirmTarget.app.name}」生成新的 API Key？`,
          label: "轮换",
          danger: true,
        },
      }[confirmTarget.action]
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">应用</h1>
        <p className="mt-2 text-sm text-muted-foreground">创建、配置与管理接入 Monitor 的应用。</p>
      </div>

      {error ? <div className="card p-4 text-sm text-red-400">{error}</div> : null}

      <SearchFilterBar search={search} onSearchChange={setSearch} onSubmit={() => setPage(1)} />

      <SectionCard title="全部应用" description={`共 ${total} 个`}>
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn btn-primary btn-sm gap-2" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> 新建应用
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名称</th>
                <th>标识</th>
                <th>域名</th>
                <th>状态</th>
                <th>环境</th>
                <th>APP Key</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    暂无应用
                  </td>
                </tr>
              ) : (
                filtered.map((app) => (
                  <tr key={app.id}>
                    <td className="font-medium">{app.name}</td>
                    <td className="font-mono text-sm">{app.slug}</td>
                    <td className="text-sm">{app.domain || "-"}</td>
                    <td>
                      <span className={`badge ${app.status === "active" ? "badge-success" : "badge-warn"}`}>
                        {appStatusLabel[app.status] ?? app.status}
                      </span>
                    </td>
                    <td>
                      <span className="badge">
                        {appEnvironmentLabel[app.environment ?? "production"] ??
                          (app.environment ?? "production")}
                      </span>
                    </td>
                    <td className="font-mono text-xs">
                      {app.apiKey ? (
                        <button
                          type="button"
                          className="max-w-full truncate rounded px-1 py-0.5 text-left text-foreground hover:bg-muted/70"
                          title="点击复制完整 APP Key"
                          onClick={() => void copyApiKey(app)}
                        >
                          {copiedAppId === app.id ? "已复制" : `${app.apiKey.slice(0, 12)}…`}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="编辑"
                          onClick={() => openEdit(app)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title={app.status === "active" ? "停用" : "启用"}
                          onClick={() => setConfirmTarget({ app, action: "toggle" })}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="轮换密钥"
                          onClick={() => setConfirmTarget({ app, action: "rotate" })}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-red-400"
                          title="删除"
                          onClick={() => setConfirmTarget({ app, action: "delete" })}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `编辑：${editing.name}` : "新建应用"}>
        <div className="space-y-4">
          <FormField label="名称">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My App"
            />
          </FormField>
          {!editing ? (
            <FormField label="标识" hint="创建后不可修改">
              <input
                className="input"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="my-app"
              />
            </FormField>
          ) : null}
          <FormField label="域名">
            <input
              className="input"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="example.com"
            />
          </FormField>
          <FormField label="描述">
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </FormField>
          <FormField label="环境">
            <select
              className="input"
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value })}
            >
              <option value="production">生产</option>
              <option value="staging">预发</option>
              <option value="development">开发</option>
            </select>
          </FormField>
          <FormField
            label="Google Client ID"
            hint={
              editing
                ? "以下为接口返回的脱敏值，便于确认已配置。直接保存表示不修改；填写完整 Client ID 可覆盖；勾选「清除」则关闭 Google 登录。勿仅保存脱敏串。"
                : "终端用户 Google 登录的 OAuth Web Client ID；留空则关闭该应用 Google 登录。"
            }
          >
            <input
              className="input font-mono text-sm"
              value={form.googleClientId}
              disabled={!!editing && clearGoogleClientId}
              onChange={(e) => {
                setGoogleClientIdDirty(true);
                setClearGoogleClientId(false);
                setForm({ ...form, googleClientId: e.target.value });
              }}
              placeholder="xxxx.apps.googleusercontent.com"
              autoComplete="off"
            />
          </FormField>
          {editing && editing.googleClientId ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={clearGoogleClientId}
                onChange={(e) => {
                  setClearGoogleClientId(e.target.checked);
                  if (e.target.checked) setGoogleClientIdDirty(false);
                }}
              />
              清除已保存的 Google Client ID（关闭终端用户 Google 登录）
            </label>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !form.name}
          >
            {saving ? "保存中…" : editing ? "更新" : "创建"}
          </button>
        </div>
      </Modal>

      {cm ? (
        <ConfirmDialog
          open={!!confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onConfirm={handleConfirm}
          title={cm.title}
          message={cm.msg}
          confirmLabel={cm.label}
          danger={cm.danger}
        />
      ) : null}
    </div>
  );
}
