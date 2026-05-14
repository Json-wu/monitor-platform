import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(appId?: string) {
    const [
      totalUsers,
      activeUsers,
      totalOrders,
      revenue,
      totalCreditsEarned,
      totalCreditsSpent,
      recentSignups,
    ] = await Promise.all([
      this.prisma.endUser.count({
        where: appId
          ? { appId, status: { not: 'deleted' } }
          : { status: { not: 'deleted' } },
      }),
      this.prisma.endUser.count({
        where: {
          ...(appId ? { appId } : {}),
          status: 'active',
          lastActiveAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.order.count({
        where: appId ? { appId, status: 'paid' } : { status: 'paid' },
      }),
      this.prisma.order.aggregate({
        where: appId ? { appId, status: 'paid' } : { status: 'paid' },
        _sum: { amount: true },
      }),
      this.prisma.creditAccount.aggregate({
        where: appId ? { appId } : {},
        _sum: { totalEarned: true, totalSpent: true },
      }),
      this.prisma.creditAccount.aggregate({
        where: appId ? { appId } : {},
        _sum: { totalSpent: true },
      }),
      this.prisma.endUser.count({
        where: {
          ...(appId ? { appId } : {}),
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const activeSubscriptions = await this.prisma.subscription.count({
      where: {
        ...(appId ? { appId } : {}),
        status: 'active',
      },
    });

    return {
      totalUsers,
      activeUsers,
      mau: activeUsers,
      recentSignups,
      totalOrders,
      revenue: revenue._sum.amount || 0,
      activeSubscriptions,
      credits: {
        totalEarned: totalCreditsEarned._sum.totalEarned || 0,
        totalSpent: totalCreditsSpent._sum.totalSpent || 0,
      },
    };
  }

  async getUserGrowth(appId?: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: Prisma.EndUserWhereInput = { createdAt: { gte: since } };
    if (appId) where.appId = appId;

    const users = await this.prisma.endUser.findMany({
      where,
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped: Record<string, number> = {};
    users.forEach((u) => {
      const day = u.createdAt.toISOString().slice(0, 10);
      grouped[day] = (grouped[day] || 0) + 1;
    });

    const result: { date: string; count: number; cumulative: number }[] = [];
    let cumulative = 0;
    const current = new Date(since);
    const now = new Date();
    while (current <= now) {
      const day = current.toISOString().slice(0, 10);
      const count = grouped[day] || 0;
      cumulative += count;
      result.push({ date: day, count, cumulative });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  async getRevenueMetrics(appId?: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: Prisma.OrderWhereInput = {
      status: 'paid',
      paidAt: { gte: since },
    };
    if (appId) where.appId = appId;

    const orders = await this.prisma.order.findMany({
      where,
      select: { amount: true, paidAt: true, type: true },
      orderBy: { paidAt: 'asc' },
    });

    const grouped: Record<string, { revenue: number; count: number }> = {};
    orders.forEach((o) => {
      const day = o.paidAt!.toISOString().slice(0, 10);
      if (!grouped[day]) grouped[day] = { revenue: 0, count: 0 };
      grouped[day].revenue += Number(o.amount);
      grouped[day].count += 1;
    });

    const result: { date: string; revenue: number; orders: number }[] = [];
    const current = new Date(since);
    const now = new Date();
    while (current <= now) {
      const day = current.toISOString().slice(0, 10);
      const data = grouped[day] || { revenue: 0, count: 0 };
      result.push({ date: day, revenue: data.revenue, orders: data.count });
      current.setDate(current.getDate() + 1);
    }

    const totalRevenue = orders.reduce((s, o) => s + Number(o.amount), 0);
    const subOrders = orders.filter((o) => o.type === 'subscription');
    const mrr = subOrders.reduce((s, o) => s + Number(o.amount), 0);

    return {
      daily: result,
      summary: {
        totalRevenue,
        totalOrders: orders.length,
        mrr,
        arr: mrr * 12,
        averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      },
    };
  }

  async getCreditUsage(appId?: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: Prisma.CreditTransactionWhereInput = {
      createdAt: { gte: since },
    };
    if (appId) where.appId = appId;

    const transactions = await this.prisma.creditTransaction.findMany({
      where,
      select: { type: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped: Record<string, { granted: number; deducted: number }> = {};
    transactions.forEach((t) => {
      const day = t.createdAt.toISOString().slice(0, 10);
      if (!grouped[day]) grouped[day] = { granted: 0, deducted: 0 };
      if (t.type === 'grant' || t.type === 'purchase') {
        grouped[day].granted += t.amount;
      } else if (t.type === 'deduct') {
        grouped[day].deducted += Math.abs(t.amount);
      }
    });

    const result: { date: string; granted: number; deducted: number }[] = [];
    const current = new Date(since);
    const now = new Date();
    while (current <= now) {
      const day = current.toISOString().slice(0, 10);
      result.push({
        date: day,
        ...(grouped[day] || { granted: 0, deducted: 0 }),
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  async getTopUsers(appId?: string, limit = 10) {
    const where: Prisma.CreditAccountWhereInput = {};
    if (appId) where.appId = appId;

    const accounts = await this.prisma.creditAccount.findMany({
      where,
      take: limit,
      orderBy: { totalSpent: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            app: { select: { id: true, name: true } },
          },
        },
      },
    });

    return accounts.map((a) => ({
      user: a.user,
      totalSpent: a.totalSpent,
      totalEarned: a.totalEarned,
      currentBalance: a.balanceSub + a.balancePayg + a.balancePromo,
    }));
  }
}
