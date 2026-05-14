"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/** 默认每页条数 */
export const DEFAULT_PAGE_SIZE = 10;

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
  /** 传入后显示「每页条数」下拉框，切换时会回调（父组件应重置页码为 1） */
  onLimitChange?: (limit: number) => void;
}

export function Pagination({ page, limit, total, onChange, onLimitChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-muted-foreground">
          共 {total} 条，第 {safePage} / {totalPages} 页
        </span>
        {onLimitChange ? (
          <label className="flex items-center gap-2 text-muted-foreground">
            <span className="whitespace-nowrap">每页显示</span>
            <select
              className="input !w-auto min-w-[7rem] py-2.5 pl-3 pr-10 text-sm leading-normal"
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} 条
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onChange(safePage - 1)}
          className="btn btn-secondary btn-sm gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          上一页
        </button>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onChange(safePage + 1)}
          className="btn btn-secondary btn-sm gap-1 disabled:opacity-40"
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
