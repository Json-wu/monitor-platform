import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toAinewsEndUserUpdate } from './ainews-end-user.util';
import { SEED_PRESET_DOMAINS } from './rss-config';

@Injectable()
export class AinewsTrackService {
  constructor(private readonly prisma: PrismaService) {}

  async trackPrefs(input: {
    userId: string;
    ip?: string;
    timezone?: string;
    followDomains?: string[];
    reminderMode?: string;
    reminderDnd?: boolean;
    reminderIntervalMinutes?: number;
    reminderWindowStartHour?: number;
    reminderWindowEndHour?: number;
    uiLang?: string;
    uiTheme?: string;
    systemLanguage?: string;
    email?: string;
    userTier?: string;
    deviceId?: string;
  }) {
    const now = new Date();
    const existing = await this.prisma.endUser.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const email = (input.email ?? '').trim().slice(0, 320);
    const userTier = (input.userTier ?? '').trim().slice(0, 32);
    const deviceId = (input.deviceId ?? '').trim().slice(0, 128);
    const followDomains =
      (input.followDomains ?? []).length > 0
        ? input.followDomains!
        : [...SEED_PRESET_DOMAINS];

    await this.prisma.endUser.update({
      where: { id: input.userId },
      data: {
        ...toAinewsEndUserUpdate(
          {
            timezone: input.timezone ?? '',
            followDomains,
            uiLang: input.uiLang ?? '',
            uiTheme: input.uiTheme ?? 'system',
            systemLanguage: input.systemLanguage ?? '',
            reminderMode: input.reminderMode ?? 'realtime',
            reminderDnd: input.reminderDnd ?? false,
            reminderIntervalMinutes: input.reminderIntervalMinutes ?? 5,
            reminderWindowStartHour: input.reminderWindowStartHour ?? 9,
            reminderWindowEndHour: input.reminderWindowEndHour ?? 18,
            email: email || undefined,
            userTier: userTier || undefined,
            deviceId: deviceId || undefined,
            lastSeenIp: input.ip ?? '',
          },
          now,
        ),
      },
    });

    await this.prisma.ainewsUserPrefsLog.create({
      data: {
        userId: input.userId,
        ip: input.ip ?? '',
        timezone: input.timezone ?? '',
        followDomains: input.followDomains ?? [],
        reminderMode: input.reminderMode ?? '',
        reminderDnd: input.reminderDnd ?? false,
        reminderIntervalMinutes: input.reminderIntervalMinutes ?? 0,
        reminderWindowStartHour: input.reminderWindowStartHour ?? 0,
        reminderWindowEndHour: input.reminderWindowEndHour ?? 0,
        uiLang: input.uiLang ?? '',
        uiTheme: input.uiTheme ?? '',
        systemLanguage: input.systemLanguage ?? '',
      },
    });

    return { ok: true };
  }

  async trackArticleAction(input: {
    userId: string;
    action: 'like' | 'dislike' | 'read' | 'open';
    canonicalUrl: string;
    sourceUrl?: string;
    ip?: string;
    timezone?: string;
  }) {
    const now = new Date();
    await this.prisma.ainewsArticleActionEvent.create({
      data: {
        userId: input.userId,
        action: input.action,
        canonicalUrl: input.canonicalUrl,
        sourceUrl: input.sourceUrl ?? '',
        ip: input.ip ?? '',
        timezone: input.timezone ?? '',
      },
    });

    if (input.action === 'open') {
      return { ok: true };
    }

    const existing = await this.prisma.ainewsArticleUserState.findUnique({
      where: {
        userId_canonicalUrl: {
          userId: input.userId,
          canonicalUrl: input.canonicalUrl,
        },
      },
    });

    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.action === 'like' && !existing?.liked) {
      patch.liked = true;
      patch.likedAt = now;
      patch.likeCount = (existing?.likeCount ?? 0) + 1;
    }
    if (input.action === 'dislike' && !existing?.disliked) {
      patch.disliked = true;
      patch.dislikedAt = now;
      patch.dislikeCount = (existing?.dislikeCount ?? 0) + 1;
    }
    if (input.action === 'read' && !existing?.read) {
      patch.read = true;
      patch.readAt = now;
      patch.readCount = (existing?.readCount ?? 0) + 1;
    }

    await this.prisma.ainewsArticleUserState.upsert({
      where: {
        userId_canonicalUrl: {
          userId: input.userId,
          canonicalUrl: input.canonicalUrl,
        },
      },
      create: {
        userId: input.userId,
        canonicalUrl: input.canonicalUrl,
        liked: input.action === 'like',
        disliked: input.action === 'dislike',
        read: input.action === 'read',
        likeCount: input.action === 'like' ? 1 : 0,
        dislikeCount: input.action === 'dislike' ? 1 : 0,
        readCount: input.action === 'read' ? 1 : 0,
        likedAt: input.action === 'like' ? now : null,
        dislikedAt: input.action === 'dislike' ? now : null,
        readAt: input.action === 'read' ? now : null,
      },
      update: patch,
    });

    return { ok: true };
  }
}
