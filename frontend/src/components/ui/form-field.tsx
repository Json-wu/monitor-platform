"use client";

import type { ReactNode } from "react";
import { Tips } from "@/components/ui/tips";

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: ReactNode;
}

export function FormField({ label, error, children, hint }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error ? <Tips variant="compact">{hint}</Tips> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
