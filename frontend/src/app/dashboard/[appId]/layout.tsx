"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { AppProvider, type AppInfo } from "@/lib/app-context";
import { DashboardShell } from "@/components/dashboard-shell";
import { useShowApiError } from "@/lib/show-api-error";

export default function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ appId: string }>();
  const router = useRouter();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const showApiError = useShowApiError();

  useEffect(() => {
    async function loadApp() {
      try {
        const data = await apiGet<AppInfo & Record<string, unknown>>(
          `/apps/${params.appId}`,
        );
        setApp({ id: data.id, name: data.name, slug: data.slug });
      } catch {
        showApiError("未找到应用");
        setNotFound(true);
      }
    }
    if (params.appId) loadApp();
  }, [params.appId, showApiError]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">未找到应用</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.replace("/dashboard")}
        >
          返回应用列表
        </button>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        正在加载应用…
      </div>
    );
  }

  return (
    <AppProvider app={app}>
      <DashboardShell>{children}</DashboardShell>
    </AppProvider>
  );
}
