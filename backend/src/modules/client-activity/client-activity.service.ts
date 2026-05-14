import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestClientActivityDto } from './dto/ingest-client-activity.dto';

function parseClientTime(iso?: string): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toJsonValue(
  meta: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (meta === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(meta)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

@Injectable()
export class ClientActivityService {
  private readonly logger = new Logger(ClientActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestByAppSlug(
    slug: string,
    dto: IngestClientActivityDto,
    ipAddress: string,
    userAgent: string | undefined,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { slug: slug.trim() },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'active') {
      throw new ForbiddenException('Application is not active');
    }

    let endUserId: string | null = null;
    if (dto.endUserId) {
      const u = await this.prisma.endUser.findFirst({
        where: { id: dto.endUserId, appId: app.id },
      });
      if (!u)
        throw new BadRequestException(
          'endUserId does not belong to this application',
        );
      endUserId = u.id;
    }

    const rows: Prisma.ClientActivityLogCreateManyInput[] = dto.events.map(
      (e) => {
        const meta = toJsonValue(e.metadata);
        const row: Prisma.ClientActivityLogCreateManyInput = {
          appId: app.id,
          endUserId,
          visitorId: dto.visitorId.trim().slice(0, 128),
          category: e.category.trim().slice(0, 64),
          action: e.action.trim().slice(0, 128),
          label: e.label?.trim().slice(0, 256) ?? null,
          summary: (e.summary?.trim() || `${e.category}/${e.action}`).slice(
            0,
            2000,
          ),
          ipAddress: ipAddress || '0.0.0.0',
          userAgent: userAgent ?? null,
          clientTime: parseClientTime(e.occurredAt),
        };
        if (meta !== undefined) {
          row.metadata = meta;
        }
        return row;
      },
    );

    try {
      await this.prisma.clientActivityLog.createMany({ data: rows });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (
          err.code === 'P2021' ||
          err.message?.includes('client_activity_log')
        ) {
          this.logger.error(
            'client_activity_log missing — run: npx prisma migrate deploy (migration 20260411120000_client_activity_log)',
          );
          throw new ServiceUnavailableException(
            'Activity storage not ready: apply database migrations for client_activity_log',
          );
        }
      }
      this.logger.error(err);
      throw err;
    }
    return { ok: true, count: rows.length };
  }

  async findAllForApp(
    appId: string,
    filters: {
      category?: string;
      action?: string;
      visitorId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.ClientActivityLogWhereInput = { appId };
    if (filters.category) where.category = filters.category;
    if (filters.action) where.action = filters.action;
    if (filters.visitorId) where.visitorId = filters.visitorId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.clientActivityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          endUser: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.clientActivityLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
