"use client";

import { createContext, useContext } from "react";

export interface AppInfo {
  id: string;
  name: string;
  slug: string;
}

const AppContext = createContext<AppInfo | null>(null);

export function AppProvider({
  app,
  children,
}: {
  app: AppInfo;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

export function useCurrentApp(): AppInfo {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useCurrentApp must be used within an AppProvider");
  }
  return ctx;
}
