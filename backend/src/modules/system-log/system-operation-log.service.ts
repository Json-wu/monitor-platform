import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/** 无登录管理员的自动化事件（Webhook 等）写入系统活动时的操作者 */
const AUTOMATION_ACTOR_EMAIL = 'system@webhook';

export type AutomationOperationLogInput = {
  appId?: string | null;
  module: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string | null;
};

@Injectable()
export class SystemOperationLogService {
  constructor(private prisma: PrismaService) {}

  private automationActor: { id: string; email: string } | null | undefined;

  /**
   * 将支付 Webhook 等自动化事件记入 system_operation_log（管理后台「系统活动」）。
   * adminId 使用首个活跃的 super_admin（表结构要求外键）；summary 中说明事件来源。
   */
  async recordAutomationEvent(input: AutomationOperationLogInput): Promise<void> {
    try {
      const actor = await this.resolveAutomationActor();
      if (!actor) return;
      await this.prisma.systemOperationLog.create({
        data: {
          adminId: actor.id,
          adminEmail: actor.email,
          module: input.module,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          summary: input.summary,
          metadata: input.metadata,
          ipAddress: input.ipAddress?.trim() || '0.0.0.0',
          userAgent: input.userAgent ?? undefined,
          appId: input.appId ?? undefined,
        },
      });
    } catch {
      // 日志失败不影响 Webhook 主流程
    }
  }

  private async resolveAutomationActor(): Promise<{
    id: string;
    email: string;
  } | null> {
    if (this.automationActor === null) return null;
    if (this.automationActor) return this.automationActor;

    const admin = await this.prisma.adminUser.findFirst({
      where: {
        isActive: true,
        role: { name: 'super_admin' },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (!admin) {
      this.automationActor = null;
      return null;
    }
    this.automationActor = {
      id: admin.id,
      email: `${AUTOMATION_ACTOR_EMAIL} via ${admin.email}`,
    };
    return this.automationActor;
  }

  async findAll(
    filters: {
      appId?: string;
      module?: string;
      action?: string;
      adminId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.SystemOperationLogWhereInput = {};
    const and: Prisma.SystemOperationLogWhereInput[] = [];

    const appId =
      filters.appId && filters.appId !== 'undefined' && filters.appId !== 'null'
        ? filters.appId
        : undefined;
    if (appId) {
      and.push({ OR: [{ appId }, { appId: null }] });
    }
    if (filters.module) and.push({ module: filters.module });
    if (filters.action) and.push({ action: filters.action });
    if (filters.adminId) and.push({ adminId: filters.adminId });
    if (filters.startDate || filters.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.startDate) createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) createdAt.lte = new Date(filters.endDate);
      and.push({ createdAt });
    }
    const q = filters.search?.trim();
    if (q) {
      and.push({
        OR: [
          { summary: { contains: q, mode: 'insensitive' } },
          { adminEmail: { contains: q, mode: 'insensitive' } },
          { module: { contains: q, mode: 'insensitive' } },
          { action: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length === 1) Object.assign(where, and[0]);
    else if (and.length > 1) where.AND = and;

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
