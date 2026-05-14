import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, EndUserAuditContext } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateUserDto, audit?: EndUserAuditContext) {
    const created = await this.prisma.endUser.create({ data: dto });
    if (audit) {
      await this.auditService.logEndUserAction({
        appId: created.appId,
        endUserId: created.id,
        module: 'users',
        action: 'create',
        summary: `终端用户已创建: ${created.email}`,
        metadata: { email: created.email },
        ...audit,
      });
    }
    return created;
  }

  async findAll(query: QueryUserDto, page = 1, limit = 20) {
    const where: Prisma.EndUserWhereInput = {};

    if (query.appId) where.appId = query.appId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.endUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          app: { select: { id: true, name: true, slug: true } },
          plan: { select: { id: true, name: true } },
          creditAccount: {
            select: {
              totalEarned: true,
              totalSpent: true,
            },
          },
        },
      }),
      this.prisma.endUser.count({ where }),
    ]);

    const userIds = data.map((u) => u.id);
    const paidByUser = new Map<string, number>();
    const currencyByUser: Record<string, string> = {};

    if (userIds.length > 0) {
      const orderWhere: Prisma.OrderWhereInput = {
        userId: { in: userIds },
        status: OrderStatus.paid,
      };
      if (query.appId) orderWhere.appId = query.appId;
      const [sums, recentPaid] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['userId'],
          where: orderWhere,
          _sum: { amount: true },
        }),
        this.prisma.order.findMany({
          where: orderWhere,
          orderBy: { paidAt: 'desc' },
          select: { userId: true, currency: true },
        }),
      ]);

      for (const row of sums) {
        const n = row._sum.amount != null ? Number(row._sum.amount) : 0;
        paidByUser.set(row.userId, n);
      }
      for (const o of recentPaid) {
        if (!(o.userId in currencyByUser))
          currencyByUser[o.userId] = o.currency;
      }
    }

    const rows = data.map(({ creditAccount, ...u }) => ({
      ...u,
      totalCredits: creditAccount?.totalEarned ?? 0,
      creditsSpent: creditAccount?.totalSpent ?? 0,
      rechargeAmount: paidByUser.get(u.id) ?? 0,
      rechargeCurrency: currencyByUser[u.id] ?? 'USD',
    }));

    return { data: rows, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.prisma.endUser.findUnique({
      where: { id },
      include: {
        app: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
        creditAccount: true,
        orders: { take: 10, orderBy: { createdAt: 'desc' } },
        subscriptions: {
          where: { status: 'active' },
          include: { plan: { select: { name: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto, audit?: EndUserAuditContext) {
    await this.findOne(id);
    const updated = await this.prisma.endUser.update({
      where: { id },
      data: dto,
    });
    if (audit) {
      await this.auditService.logEndUserAction({
        appId: updated.appId,
        endUserId: updated.id,
        module: 'users',
        action: 'update',
        summary: `终端用户已更新: ${updated.email}`,
        metadata: dto as unknown as Prisma.InputJsonValue,
        ...audit,
      });
    }
    return updated;
  }

  async remove(id: string, audit?: EndUserAuditContext) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.endUser.update({
      where: { id },
      data: { status: 'deleted' },
    });
    if (audit) {
      await this.auditService.logEndUserAction({
        appId: existing.appId,
        endUserId: existing.id,
        module: 'users',
        action: 'delete',
        summary: `终端用户已标记删除: ${existing.email}`,
        ...audit,
      });
    }
    return updated;
  }
}
