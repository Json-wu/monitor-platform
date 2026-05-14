"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Calendar, Globe } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useCurrentUser } from "@/lib/user-context";
import { TopBar } from "@/components/top-bar";

interface App {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  description?: string | null;
  createdAt: string;
}

function siteUrlFromDomain(domain: string): string {
  const t = domain.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export default function AppSelectPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">应用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            请选择要管理的应用。
          </p>
        </div>
        <TopBar showSystemSettings={false} />
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
          <p className="text-lg font-medium">暂无可用应用</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.allowedApps.length > 0
              ? "未找到您有权限的应用。"
              : "请先进入某个应用，在侧栏打开系统设置。"}
          </p>
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
                <div className="rounded-xl bg-accent/20 p-2.5 text-accent">
                  <AppWindow className="h-5 w-5" />
                </div>
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
    </div>
  );
}
