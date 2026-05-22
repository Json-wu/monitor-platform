import type { ReactNode } from "react";
import { Tips } from "@/components/ui/tips";

export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      {hint ? (
        <div className="mt-2">
          <Tips variant="compact">{hint}</Tips>
        </div>
      ) : null}
    </div>
  );
}
