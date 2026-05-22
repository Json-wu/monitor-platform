"use client";

import { useEffect, useState } from "react";
import { apiGetScoped } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { useShowApiError } from "@/lib/show-api-error";

type DataShape = Record<string, unknown> | Record<string, unknown>[];

function isWrappedResponse(value: DataShape): value is { data: Record<string, unknown>[] } {
  return !Array.isArray(value) && Array.isArray((value as { data?: unknown }).data);
}

export function ResourcePage({
  title,
  description,
  endpoint,
}: {
  title: string;
  description: string;
  endpoint: string;
}) {
  const app = useCurrentApp();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const showApiError = useShowApiError();

  useEffect(() => {
    async function load() {
      try {
        const response = await apiGetScoped<DataShape>(endpoint, app.id);
        if (Array.isArray(response)) {
          setRows(response);
          return;
        }
        if (isWrappedResponse(response)) {
          setRows(response.data);
          return;
        }
        setRows([response]);
      } catch (err) {
        showApiError(err);
      }
    }

    load();
  }, [endpoint, app.id, showApiError]);

  const columns = rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      <SectionCard title={title} description={`当前应用：${app.name}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length || 1} className="text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    {columns.map((column) => (
                      <td key={column}>{formatCell(row[column])}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function formatCell(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "object") {
    return <pre className="max-w-xs overflow-auto text-xs">{JSON.stringify(value)}</pre>;
  }
  return String(value);
}
