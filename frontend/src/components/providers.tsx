"use client";

import type { ReactNode } from "react";
import { TipsToastProvider } from "@/components/ui/tips-toast-provider";

export function Providers({ children }: { children: ReactNode }) {
  return <TipsToastProvider>{children}</TipsToastProvider>;
}
