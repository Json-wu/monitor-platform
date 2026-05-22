"use client";

import { Lightbulb } from "lucide-react";
import type { ReactNode } from "react";

type TipsProps = {
  children: ReactNode;
  /** compact：表单项下方短提示；block：区块说明 */
  variant?: "compact" | "block";
  title?: string;
  tone?: "default" | "error";
  className?: string;
};

export function Tips({
  children,
  variant = "block",
  title,
  tone = "default",
  className = "",
}: TipsProps) {
  const isError = tone === "error";
  const iconClass = isError ? "text-red-400" : "text-amber-400";
  const iconWrapClass = isError ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400";
  const boxClass = isError
    ? "border-red-500/40 bg-red-500/10"
    : "border-border bg-muted/30";

  if (variant === "compact") {
    return (
      <div
        className={`flex gap-2 rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground ${boxClass} ${className}`}
      >
        <Lightbulb className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-hidden />
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${boxClass} ${className}`}>
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconWrapClass}`}
        >
          <Lightbulb className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm leading-relaxed text-muted-foreground">
          {title ? (
            <p className={`font-medium ${isError ? "text-red-200" : "text-foreground"}`}>{title}</p>
          ) : null}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
