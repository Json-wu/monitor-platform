import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submitByAppSlug(
    slug: string,
    dto: SubmitFeedbackDto,
    ipAddress?: string,
    userAgent?: string | null,
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
        select: { id: true },
      });
      if (!u) {
        throw new BadRequestException(
          'endUserId does not belong to this application',
        );
      }
      endUserId = u.id;
    }

    const row = await this.prisma.userFeedback.create({
      data: {
        appId: app.id,
        endUserId,
        nickname: dto.nickname.trim().slice(0, 128),
        email: dto.email.trim().toLowerCase().slice(0, 320),
        subject: dto.subject.trim().slice(0, 256),
        message: dto.message.trim().slice(0, 5000),
        ipAddress: ipAddress || null,
        userAgent: userAgent ?? null,
      },
      select: { id: true, createdAt: true },
    });

    return { ok: true, id: row.id, createdAt: row.createdAt };
  }

  async findAllForApp(
    appId: string,
    filters: {
      status?: FeedbackStatus;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 20,
  ) {
    const where: Prisma.UserFeedbackWhereInput = { appId };

    if (filters.status) where.status = filters.status;

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { nickname: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.userFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          endUser: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.userFeedback.count({ where }),
    ]);

    return { data, total, page: Math.max(page, 1), limit: take };
  }

  async updateStatus(appId: string, id: string, status: FeedbackStatus) {
    const existing = await this.prisma.userFeedback.findFirst({
      where: { id, appId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Feedback not found');

    return this.prisma.userFeedback.update({
      where: { id },
      data: { status },
      include: {
        endUser: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async remove(appId: string, id: string) {
    const existing = await this.prisma.userFeedback.findFirst({
      where: { id, appId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Feedback not found');
    await this.prisma.userFeedback.delete({ where: { id } });
    return { ok: true };
  }
}
