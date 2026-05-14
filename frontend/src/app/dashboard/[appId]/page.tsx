"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import { apiGetScoped } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";

type Overview = {
  totalUsers: number;
  activeUsers: number;
  mau: number;
  recentSignups: number;
  totalOrders: number;
  revenue: string | number;
  activeSubscriptions: number;
  credits: {
    totalEarned: number;
    totalSpent: number;
  };
};

type GrowthPoint = {
  date: string;
  count: number;
  cumulative: number;
};

type RevenueResponse = {
  daily: { date: string; revenue: number; orders: number }[];
  summary: {
    totalRevenue: number;
    totalOrders: number;
    mrr: number;
    arr: number;
    averageOrderValue: number;
  };
};

type TopUser = {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    app?: { id: string; name: string } | null;
  };
  totalSpent: number;
  totalEarned: number;
  currentBalance: number;
};

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "8px",
  },
  labelStyle: { color: "#e4e4e7" },
  itemStyle: { color: "#e4e4e7" },
};

export default function AppOverviewPage() {
  const app = useCurrentApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, growthData, revenueData, topUsersData] =
          await Promise.all([
            apiGetScoped<Overview>("/analytics/overview", app.id),
            apiGetScoped<GrowthPoint[]>("/analytics/user-growth?days=14", app.id),
            apiGetScoped<RevenueResponse>("/analytics/revenue?days=30", app.id),
            apiGetScoped<TopUser[]>("/analytics/top-users?limit=5", app.id),
          ]);

        setOverview(overviewData);
        setGrowth(growthData);
        setRevenue(revenueData);
        setTopUsers(topUsersData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载概览数据失败");
      }
    }

    load();
  }, [app.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">概览</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          应用 <span className="font-medium text-foreground">{app.name}</span> 的增长、收入、用量与头部用户。
        </p>
      </div>

      {error ? <div className="card p-4 text-sm text-red-400">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="用户总数" value={overview?.totalUsers ?? "-"} />
        <KpiCard label="近 7 日注册" value={overview?.recentSignups ?? "-"} />
        <KpiCard
          label="收入"
          value={revenue ? `$${revenue.summary.totalRevenue.toFixed(2)}` : "-"}
        />
        <KpiCard label="已消耗积分" value={overview?.credits.totalSpent ?? "-"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="用户增长" description="每日新增与累计增长">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growth}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(value, name) => [`${Number(value ?? 0)} 人`, String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8, color: "#a1a1aa" }} />
                <Line
                  name="当日新增"
                  type="monotone"
                  dataKey="count"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                />
                <Line
                  name="累计用户"
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#10b981"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="收入趋势" description="近 30 日付费订单收入">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue?.daily ?? []}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(value, name) => [
                    `$${Number(value ?? 0).toFixed(2)}`,
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8, color: "#a1a1aa" }} />
                <Bar
                  name="收入（美元）"
                  dataKey="revenue"
                  fill="#8b5cf6"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="头部用户" description="按积分消耗排序">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>用户</th>
                <th>邮箱</th>
                <th>消耗</th>
                <th>获得</th>
                <th>余额</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((item) => (
                <tr key={item.user.id}>
                  <td>{item.user.name || "-"}</td>
                  <td>{item.user.email}</td>
                  <td>{item.totalSpent}</td>
                  <td>{item.totalEarned}</td>
                  <td>{item.currentBalance}</td>
                  <td className="text-xs text-muted-foreground">
                    {new Date(item.user.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
