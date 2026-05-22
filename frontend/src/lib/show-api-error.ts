"use client";

import { useCallback } from "react";
import { getErrorMessages } from "@/lib/api-errors";
import { useTipsToast } from "@/components/ui/tips-toast-provider";

/** 将 API / 网络错误以顶部 Tips 气泡展示 */
export function useShowApiError() {
  const { showTips } = useTipsToast();

  return useCallback(
    (err: unknown) => {
      showTips(getErrorMessages(err));
    },
    [showTips],
  );
}
