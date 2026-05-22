"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TipsToastStack } from "@/components/ui/tips-toast";
import { parseApiErrorMessages } from "@/lib/api-errors";

type ToastItem = {
  id: string;
  message: string;
};

type TipsToastContextValue = {
  showTips: (input: string | string[]) => void;
  clearTips: () => void;
};

const TipsToastContext = createContext<TipsToastContextValue | null>(null);

let toastSeq = 0;

function nextToastId(): string {
  toastSeq += 1;
  return `tips-${Date.now()}-${toastSeq}`;
}

export function TipsToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showTips = useCallback((input: string | string[]) => {
    const messages =
      typeof input === "string"
        ? parseApiErrorMessages(input)
        : [...new Set(input.flatMap((msg) => parseApiErrorMessages(msg)))];
    if (messages.length === 0) return;

    setItems((prev) => [
      ...prev,
      ...messages.map((message) => ({ id: nextToastId(), message })),
    ]);
  }, []);

  const clearTips = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo(
    () => ({ showTips, clearTips }),
    [showTips, clearTips],
  );

  return (
    <TipsToastContext.Provider value={value}>
      {children}
      <TipsToastStack items={items} onDismiss={dismiss} duration={3000} />
    </TipsToastContext.Provider>
  );
}

export function useTipsToast(): TipsToastContextValue {
  const ctx = useContext(TipsToastContext);
  if (!ctx) {
    throw new Error("useTipsToast must be used within TipsToastProvider");
  }
  return ctx;
}
