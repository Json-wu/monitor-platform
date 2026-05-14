"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { clearToken } from "@/lib/auth";
import { apiLogoutSafe } from "@/lib/api";
import { useCurrentUser, isSystemAdmin } from "@/lib/user-context";

export function TopBar({ showSystemSettings = true }: { showSystemSettings?: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();
  const admin = isSystemAdmin(user) && showSystemSettings;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      {admin ? (
        <Link
          href="/settings"
          className="btn btn-ghost btn-sm gap-2 text-sm"
          title="系统设置"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">设置</span>
        </Link>
      ) : null}

      <div className="flex items-center gap-2.5">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 外链头像，避免配置远程域名
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            {initials}
          </div>
        )}
        <div className="hidden sm:block">
          <div className="text-sm font-medium leading-tight">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.roleDisplayName}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={async () => {
          await apiLogoutSafe();
          clearToken();
          router.replace("/login");
        }}
        className="btn btn-ghost btn-sm"
        title="退出登录"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
