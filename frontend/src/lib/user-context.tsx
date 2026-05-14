"use client";

import { createContext, useContext } from "react";

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  roleName: string;
  roleDisplayName: string;
  permissions: Record<string, string[]>;
  allowedApps: string[];
}

const UserContext = createContext<UserInfo | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: UserInfo;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): UserInfo {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within a UserProvider");
  }
  return ctx;
}

export function hasPermission(user: UserInfo, perm: string): boolean {
  const [mod, action] = perm.split(":");
  const actions = user.permissions[mod];
  return !!actions && (actions.includes(action) || actions.includes("*"));
}

export function hasModule(user: UserInfo, module: string): boolean {
  return !!user.permissions[module]?.length;
}

export function isSystemAdmin(user: UserInfo): boolean {
  return hasPermission(user, "config:view");
}
