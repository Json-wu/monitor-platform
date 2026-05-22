import type { ReactNode } from "react";
import { Tips } from "@/components/ui/tips";

export function SectionCard({
  title,
  description,
  tips,
  children,
}: {
  title: string;
  description?: string;
  tips?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        {tips ? (
          <div className={description ? "mt-3" : "mt-2"}>
            <Tips>{tips}</Tips>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
