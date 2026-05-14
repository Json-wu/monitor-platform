"use client";

import { Search } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

interface SearchFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  filters?: {
    key: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }[];
}

export function SearchFilterBar({
  search,
  onSearchChange,
  onSubmit,
  filters,
}: SearchFilterBarProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-wrap items-stretch gap-3"
    >
      <div className="min-w-[200px] flex-1">
        <input
          type="text"
          className="input h-full"
          placeholder="搜索…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {filters?.map((f) => (
        <div key={f.key}>
          <select
            className="input h-full"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button type="submit" className="btn btn-primary gap-2">
        <Search className="h-4 w-4" />
        搜索
      </button>
    </form>
  );
}
