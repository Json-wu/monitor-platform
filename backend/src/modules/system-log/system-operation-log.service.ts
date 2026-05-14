import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SystemOperationLogService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    filters: {
      appId?: string;
      module?: string;
      action?: string;
      adminId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.SystemOperationLogWhereInput = {};

    const appId =
      filters.appId && filters.appId !== 'undefined' && filters.appId !== 'null'
        ? filters.appId
        : undefined;
    // Login/logout and other global actions store appId = null; still show them when
    // the UI filters by current app context.
    if (appId) {
      where.OR = [{ appId }, { appId: null }];
    }
    if (filters.module) where.module = filters.module;
    if (filters.action) where.action = filters.action;
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.systemOperationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.systemOperationLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
