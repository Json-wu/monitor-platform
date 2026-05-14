"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppWindow,
  ArrowLeftRight,
  Bell,
  BookOpen,
  Coins,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Logs,
  Layers,
  ScrollText,
  Shield,
  Tags,
  Users,
} from "lucide-react";
import { clearToken } from "@/lib/auth";
import { apiLogoutSafe } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { useCurrentUser, hasPermission, isSystemAdmin } from "@/lib/user-context";
import { getApiDocsUrl } from "@/lib/api-docs-url";

const navItems = [
  { path: "", label: "概览", icon: LayoutDashboard, permission: null },
  { path: "/users", label: "用户", icon: Users, permission: "users:view" },
  { path: "/credits", label: "积分", icon: Coins, permission: "credits:view" },
  { path: "/orders", label: "订单", icon: CreditCard, permission: "orders:view" },
  { path: "/pricing", label: "定价", icon: Tags, permission: "pricing:view" },
  { path: "/logs", label: "终端活动", icon: Logs, permission: "audit:view" },
  { path: "/notifications", label: "通知", icon: Bell, permission: "notifications:view" },
];

const settingsNavItems = [
  { segment: "admins", label: "管理员", icon: Users, permission: "admins:view" as const },
  { segment: "roles", label: "角色与权限", icon: Shield, permission: "roles:view" as const },
  { segment: "apps", label: "应用", icon: AppWindow, permission: "apps:view" as const },
  {
    segment: "integrations",
    label: "集成",
    icon: Layers,
    permission: "apps:view" as const,
  },
  { segment: "system-logs", label: "系统活动", icon: ScrollText, permission: "system_logs:view" as const },
] as const;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const app = useCurrentApp();
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/dashboard/${app.id}`;

  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen md:flex md:h-[100dvh] md:max-h-[100dvh] md:flex-row md:overflow-hidden">
      <aside className="shrink-0 border-b border-border bg-black/20 px-4 py-6 backdrop-blur md:h-full md:w-[260px] md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-6 px-2">
          <div className="mb-1 truncate text-lg font-semibold">{app.name}</div>
          <div className="truncate text-xs text-muted-foreground">{app.slug}</div>
        </div>

        <Link
          href="/dashboard"
          className="mb-6 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          切换应用
        </Link>

        <a
          href={getApiDocsUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          API 文档（OpenAPI）
        </a>

        <nav className="space-y-1">
          {visibleItems.map(({ path, label, icon: Icon }) => {
            const href = `${basePath}${path}`;
            const active =
              path === ""
                ? pathname === basePath
                : pathname.startsWith(href);
            return (
              <Link
                key={path}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {isSystemAdmin(user) ? (
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              系统设置
            </div>
            <nav className="space-y-1">
              {settingsNavItems
                .filter((item) => hasPermission(user, item.permission))
                .map(({ segment, label, icon: Icon }) => {
                  const href = `${basePath}/settings/${segment}`;
                  const active = pathname === href;
                  return (
                    <Link
                      key={segment}
                      href={href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
            </nav>
          </div>
        ) : null}

        <div className="mt-8 border-t border-border pt-4">
          <div className="mb-3 flex items-center gap-2.5 px-2">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 外链头像，避免配置远程域名
              <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.roleDisplayName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await apiLogoutSafe();
              clearToken();
              router.replace("/login");
            }}
            className="btn btn-secondary w-full gap-2"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
