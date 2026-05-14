import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type EndUserAuditContext = {
  actorAdminId: string;
  actorAdminEmail: string;
  ipAddress: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async logEndUserAction(
    data: {
      appId: string;
      endUserId: string;
      module: string;
      action: string;
      summary: string;
      metadata?: Prisma.InputJsonValue;
    } & EndUserAuditContext,
  ) {
    try {
      await this.prisma.endUserAuditLog.create({
        data: {
          appId: data.appId,
          endUserId: data.endUserId,
          module: data.module,
          action: data.action,
          summary: data.summary,
          metadata: data.metadata,
          actorAdminId: data.actorAdminId,
          actorAdminEmail: data.actorAdminEmail,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch {
      // non-fatal
    }
  }

  async findAll(
    filters: {
      appId?: string;
      module?: string;
      action?: string;
      endUserId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.EndUserAuditLogWhereInput = {};

    const appId =
      filters.appId && filters.appId !== 'undefined' && filters.appId !== 'null'
        ? filters.appId
        : undefined;
    if (appId) where.appId = appId;
    if (filters.module) where.module = filters.module;
    if (filters.action) where.action = filters.action;
    if (filters.endUserId) where.endUserId = filters.endUserId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.endUserAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          endUser: { select: { id: true, email: true, name: true } },
          actorAdmin: { select: { id: true, email: true, name: true } },
          app: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.endUserAuditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
