"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useCurrentApp, type AppInfo } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { useAppliedSearch } from "@/lib/use-applied-search";
import { Pagination } from "@/components/ui/pagination";
import { creditTransactionReasonZh } from "@/lib/credit-transaction-label";
import { useShowApiError } from "@/lib/show-api-error";

interface Transaction {
  id: string;
  type: string;
  creditType: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
  account?: {
    user?: { id: string; email: string; name: string | null };
    app?: { id: string; name: string } | null;
  };
}

const typeOptions = [
  { value: "grant", label: "发放" },
  { value: "deduct", label: "扣减" },
  { value: "refund", label: "退款" },
  { value: "purchase", label: "购买" },
  { value: "expire", label: "过期" },
];

const typeLabel: Record<string, string> = {
  grant: "发放",
  deduct: "扣减",
  refund: "退款",
  purchase: "购买",
  expire: "过期",
};

const creditTypeLabel: Record<string, string> = {
  subscription: "订阅",
  payg: "按量付费",
  promo: "活动赠送",
};

function CreditsPageInner({ app }: { app: AppInfo }) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const { searchDraft, setSearchDraft, appliedSearch, applySearch } = useAppliedSearch();
  const [typeFilter, setTypeFilter] = useState("");
  const [limit, setLimit] = useState(10);
  const showApiError = useShowApiError();

  const load = useCallback(async () => {
    try {
      let path = `/credits/transactions?page=${page}&limit=${limit}`;
      if (typeFilter) path += `&type=${typeFilter}`;
      path += `&appId=${encodeURIComponent(app.id)}`;
      const res = await apiGet<{ data: Transaction[]; total: number }>(path);
      setRows(res.data);
      setTotal(res.total);
    } catch (err) {
      showApiError(err);
    }
  }, [page, typeFilter, limit, app.id, showApiError]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const filtered = appliedSearch
    ? rows.filter((r) => {
        const q = appliedSearch.toLowerCase();
        const raw = r.reason.toLowerCase();
        const zh = creditTransactionReasonZh(r.reason).toLowerCase();
        const email = r.account?.user?.email?.toLowerCase() ?? "";
        const name = r.account?.user?.name?.toLowerCase() ?? "";
        return (
          raw.includes(q) ||
          zh.includes(q) ||
          email.includes(q) ||
          name.includes(q)
        );
      })
    : rows;

  function handleSearchSubmit() {
    applySearch();
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">积分流水</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          查看当前应用下的积分变动记录。
        </p>
      </div>

      <SearchFilterBar
        search={searchDraft}
        onSearchChange={setSearchDraft}
        onSubmit={handleSearchSubmit}
        filters={[
          {
            key: "type",
            label: "全部类型",
            value: typeFilter,
            options: typeOptions,
            onChange: (v) => {
              setTypeFilter(v);
              setPage(1);
            },
          },
        ]}
      />

      <SectionCard title="积分流水" description={`共 ${total} 条`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>用户</th>
                <th>类型</th>
                <th>积分类型</th>
                <th>数量</th>
                <th>变动后余额</th>
                <th>原因</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    暂无流水
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                <tr key={t.id}>
                  <td className="text-sm">
                    {t.account?.user?.name?.trim()
                      ? t.account.user.name
                      : (t.account?.user?.email ?? "-")}
                  </td>
                  <td><span className={`badge ${t.type === "grant" ? "badge-success" : t.type === "deduct" ? "badge-error" : ""}`}>{typeLabel[t.type] ?? t.type}</span></td>
                  <td><span className="badge">{creditTypeLabel[t.creditType] ?? t.creditType}</span></td>
                  <td className={t.type === "grant" ? "text-green-400" : t.type === "deduct" ? "text-red-400" : ""}>
                    {['grant', 'refund'].includes(t.type) ? "+" : ""}{t.amount}
                  </td>
                  <td>{t.balanceAfter}</td>
                  <td className="max-w-[200px] truncate text-sm" title={t.reason}>
                    {creditTransactionReasonZh(t.reason)}
                  </td>
                  <td className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onChange={setPage}
          onLimitChange={(n) => {
            setLimit(n);
            setPage(1);
          }}
        />
      </SectionCard>
    </div>
  );
}

export default function CreditsPage() {
  const app = useCurrentApp();
  return <CreditsPageInner key={app.id} app={app} />;
}
