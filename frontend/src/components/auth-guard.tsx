"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, getToken } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { UserProvider, type UserInfo } from "@/lib/user-context";

function mapProfile(profile: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  roleName: string;
  roleDisplayName: string;
  permissions: Record<string, string[]>;
  allowedApps: string[];
}): UserInfo {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    roleName: profile.roleName,
    roleDisplayName: profile.roleDisplayName,
    permissions: profile.permissions as Record<string, string[]>,
    allowedApps: profile.allowedApps,
  };
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  /** 未登录访问受保护路由 → 去登录页（仅随路径变化） */
  useEffect(() => {
    const token = getToken();
    if (!token && pathname !== "/login") {
      router.replace("/login");
    }
  }, [pathname, router]);

  /**
   * 用户信息只应在有 token 时拉取一次；勿把 pathname/router 放进依赖，
   * 否则每次切页或 router 引用变化都会重复请求 /auth/profile，造成整页「闪」、重复请求。
   */
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    apiGet<{
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      roleName: string;
      roleDisplayName: string;
      permissions: Record<string, string[]>;
      allowedApps: string[];
    }>("/auth/profile")
      .then((profile) => {
        if (!cancelled) setUser(mapProfile(profile));
      })
      .catch(() => {
        if (!cancelled) {
          // 无效 token 必须清除，否则登录页会因「仍有 token」再跳回 /dashboard，形成死循环
          clearToken();
          router.replace("/login");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // 仅挂载时请求；勿依赖 pathname/router，否则切页会反复打 /auth/profile 导致整页闪动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        正在加载控制台…
      </div>
    );
  }

  return <UserProvider user={user}>{children}</UserProvider>;
}
