"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Calendar, Globe, Plus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { hasPermission, useCurrentUser } from "@/lib/user-context";
import { TopBar } from "@/components/top-bar";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { AppDomainLogo } from "@/components/app-domain-logo";
import { siteOriginFromDomain } from "@/lib/domain-favicon";

interface App {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  description?: string | null;
  createdAt: string;
}

type CreateAppForm = {
  name: string;
  slug: string;
  domain: string;
  description: string;
  environment: string;
};

const emptyCreateForm: CreateAppForm = {
  name: "",
  slug: "",
  domain: "",
  description: "",
  environment: "production",
};

function siteUrlFromDomain(domain: string): string {
  return siteOriginFromDomain(domain);
}

export default function AppSelectPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canCreateApp = hasPermission(user, "apps:create");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAppForm>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadApps = useCallback(async () => {
    try {
      const res = await apiGet<{ data: App[] }>("/apps");
      let list = res.data ?? [];
      if (user.allowedApps.length > 0) {
        list = list.filter((a) => user.allowedApps.includes(a.id));
      }
      setApps(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载应用列表失败");
    } finally {
      setLoading(false);
    }
  }, [user.allowedApps]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setCreateError("");
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!createForm.name.trim() || !createForm.slug.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await apiPost<App>("/apps", {
        ...createForm,
        name: createForm.name.trim(),
        slug: createForm.slug.trim(),
        domain: createForm.domain.trim(),
        description: createForm.description.trim(),
      });
      setCreateOpen(false);
      router.push(`/dashboard/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建应用失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">应用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            请选择要管理的应用。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreateApp && apps.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-sm gap-2"
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5" /> 新建应用
            </button>
          ) : null}
          <TopBar showSystemSettings={false} />
        </div>
      </div>

      {error ? (
        <div className="card mb-6 p-4 text-sm text-red-400">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          正在加载应用列表…
        </div>
      ) : apps.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <AppWindow className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium">
            {canCreateApp ? "尚未创建任何应用" : "暂无可用应用"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canCreateApp
              ? "立即创建首个应用，进入对应看板进行配置。"
              : user.allowedApps.length > 0
                ? "未找到您有权限的应用，请联系管理员分配。"
                : "请联系超级管理员创建应用并分配权限。"}
          </p>
          {canCreateApp ? (
            <button
              type="button"
              className="btn btn-primary mt-6 gap-2"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" /> 创建第一个应用
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => router.push(`/dashboard/${app.id}`)}
              className="card group cursor-pointer p-6 text-left transition hover:border-accent/50 hover:bg-accent/5"
            >
              <div className="mb-4 flex items-center gap-3">
                <AppDomainLogo domain={app.domain} withWrapper />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{app.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{app.slug}</div>
                </div>
                <span
                  className={`badge text-xs ${app.status === "active" ? "badge-success" : "badge-warn"}`}
                >
                  {app.status}
                </span>
              </div>

              {app.description ? (
                <p className="mb-3 text-xs text-muted-foreground line-clamp-2">
                  {app.description}
                </p>
              ) : null}

              <div className="space-y-2 text-xs text-muted-foreground">
                {app.domain ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={siteUrlFromDomain(app.domain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-left text-primary underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {app.domain}
                    </a>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>创建于 {new Date(app.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => (creating ? null : setCreateOpen(false))}
        title="新建应用"
      >
        <div className="space-y-4">
          <FormField label="名称">
            <input
              className="input"
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
              placeholder="My App"
              autoFocus
            />
          </FormField>
          <FormField label="标识" hint="小写字母 / 数字 / 短横线，创建后不可修改">
            <input
              className="input"
              value={createForm.slug}
              onChange={(e) =>
                setCreateForm({ ...createForm, slug: e.target.value })
              }
              placeholder="my-app"
            />
          </FormField>
          <FormField label="域名">
            <input
              className="input"
              value={createForm.domain}
              onChange={(e) =>
                setCreateForm({ ...createForm, domain: e.target.value })
              }
              placeholder="example.com"
            />
          </FormField>
          <FormField label="描述">
            <textarea
              className="input"
              rows={2}
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
            />
          </FormField>
          <FormField label="环境">
            <select
              className="input"
              value={createForm.environment}
              onChange={(e) =>
                setCreateForm({ ...createForm, environment: e.target.value })
              }
            >
              <option value="production">生产</option>
              <option value="staging">预发</option>
              <option value="development">开发</option>
            </select>
          </FormField>
          {createError ? (
            <p className="text-sm text-red-400">{createError}</p>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCreateOpen(false)}
            disabled={creating}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCreate}
            disabled={
              creating || !createForm.name.trim() || !createForm.slug.trim()
            }
          >
            {creating ? "创建中…" : "创建并进入"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
