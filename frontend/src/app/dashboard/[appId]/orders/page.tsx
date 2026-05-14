"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useCurrentApp, type AppInfo } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { SearchFilterBar } from "@/components/ui/search-filter-bar";
import { Pagination } from "@/components/ui/pagination";

interface Order {
  id: string;
  orderNo: string;
  type: string;
  status: string;
  amount: number | string;
  currency: string;
  creditsGranted: number;
  createdAt: string;
  user?: { id: string; email: string; name: string | null };
  app?: { id: string; name: string } | null;
}

const statusOptions = [
  { value: "pending", label: "待支付" },
  { value: "paid", label: "已支付" },
  { value: "failed", label: "失败" },
  { value: "refunded", label: "已退款" },
  { value: "cancelled", label: "已取消" },
];

const statusLabel: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  failed: "失败",
  refunded: "已退款",
  cancelled: "已取消",
};

/** 与 Prisma `OrderType` 一致 */
const orderTypeLabel: Record<string, string> = {
  subscription: "订阅",
  payg: "按量付费",
  one_time: "一次性",
};

function OrdersPageInner({ app }: { app: AppInfo }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(10);

  const load = useCallback(async () => {
    try {
      let path = `/orders?page=${page}&limit=${limit}`;
      if (statusFilter) path += `&status=${statusFilter}`;
      path += `&appId=${encodeURIComponent(app.id)}`;
      const res = await apiGet<{ data: Order[]; total: number }>(path);
      setOrders(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [page, statusFilter, limit, app.id]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const filtered = search
    ? orders.filter((o) => {
        const q = search.toLowerCase();
        const no = o.orderNo.toLowerCase();
        const email = o.user?.email?.toLowerCase() ?? "";
        const name = o.user?.name?.toLowerCase() ?? "";
        return (
          no.includes(q) ||
          email.includes(q) ||
          name.includes(q)
        );
      })
    : orders;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">订单</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          查看当前应用下的订单记录；列表展示用户与订单类型（中文）。
        </p>
      </div>

      {error ? <div className="card p-4 text-sm text-red-400">{error}</div> : null}

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        onSubmit={() => setPage(1)}
        filters={[
          {
            key: "status",
            label: "全部状态",
            value: statusFilter,
            options: statusOptions,
            onChange: (v) => {
              setStatusFilter(v);
              setPage(1);
            },
          },
        ]}
      />

      <SectionCard title="订单" description={`共 ${total} 笔`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户</th>
                <th>类型</th>
                <th>金额</th>
                <th>积分</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    暂无订单
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono text-sm">{o.orderNo}</td>
                    <td className="text-sm">
                      {o.user?.name?.trim()
                        ? o.user.name
                        : (o.user?.email ?? "-")}
                    </td>
                    <td>
                      <span className="badge">
                        {orderTypeLabel[o.type] ?? o.type}
                      </span>
                    </td>
                    <td>
                      ${Number(o.amount).toFixed(2)} {o.currency}
                    </td>
                    <td>{o.creditsGranted}</td>
                    <td>
                      <span
                        className={`badge ${o.status === "paid" ? "badge-success" : o.status === "failed" ? "badge-error" : o.status === "refunded" ? "badge-warn" : ""}`}
                      >
                        {statusLabel[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
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

export default function OrdersPage() {
  const app = useCurrentApp();
  return <OrdersPageInner key={app.id} app={app} />;
}
