import type { EndUser, Prisma, PrismaClient } from '@prisma/client';
import { AINEWS_APP_SLUG } from './ainews.constants';
import { SEED_PRESET_DOMAINS } from './rss-config';

let cachedAinewsAppId: string | null = null;

type AinewsDb = PrismaClient | Prisma.TransactionClient;

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export function guestEmailForUserId(userId: string): string {
  return `guest+${userId.replace(/-/g, '')}@ainews.internal`;
}

export function isDeviceGuestUser(user: Pick<EndUser, 'oauthProvider' | 'email'>): boolean {
  return user.oauthProvider === 'device' || user.email.endsWith('@ainews.internal');
}

export async function resolveAinewsAppId(prisma: PrismaClient): Promise<string> {
  if (cachedAinewsAppId) return cachedAinewsAppId;
  const app = await prisma.application.findUnique({
    where: { slug: AINEWS_APP_SLUG },
    select: { id: true },
  });
  if (!app) {
    throw new Error(`Application not found: ${AINEWS_APP_SLUG}`);
  }
  cachedAinewsAppId = app.id;
  return app.id;
}

export type AinewsProfilePatch = {
  timezone?: string;
  uiLang?: string;
  uiTheme?: string;
  systemLanguage?: string;
  followDomains?: string[];
  reminderMode?: string;
  reminderDnd?: boolean;
  reminderIntervalMinutes?: number;
  reminderWindowStartHour?: number;
  reminderWindowEndHour?: number;
  email?: string;
  userTier?: string;
  deviceId?: string;
  lastSeenIp?: string;
};

export function mergeAinewsProfile(
  target: Pick<
    EndUser,
    | 'ainewsDeviceId'
    | 'ainewsEmail'
    | 'ainewsTimezone'
    | 'ainewsFollowDomains'
    | 'ainewsUiLang'
    | 'ainewsUiTheme'
    | 'ainewsSystemLanguage'
    | 'ainewsReminderMode'
    | 'ainewsReminderDnd'
    | 'ainewsReminderIntervalMinutes'
    | 'ainewsReminderWindowStartHour'
    | 'ainewsReminderWindowEndHour'
    | 'ainewsUserTier'
    | 'ainewsLastSeenIp'
  >,
  guest: typeof target,
): AinewsProfilePatch {
  return {
    deviceId: target.ainewsDeviceId.trim() || guest.ainewsDeviceId.trim() || undefined,
    email: target.ainewsEmail.trim() || guest.ainewsEmail.trim() || undefined,
    timezone: target.ainewsTimezone.trim() || guest.ainewsTimezone.trim() || undefined,
    followDomains:
      target.ainewsFollowDomains.length > 0
        ? target.ainewsFollowDomains
        : guest.ainewsFollowDomains.length > 0
          ? guest.ainewsFollowDomains
          : [...SEED_PRESET_DOMAINS],
    uiLang: target.ainewsUiLang.trim() || guest.ainewsUiLang.trim() || undefined,
    uiTheme: target.ainewsUiTheme.trim() || guest.ainewsUiTheme.trim() || undefined,
    systemLanguage:
      target.ainewsSystemLanguage.trim() || guest.ainewsSystemLanguage.trim() || undefined,
    reminderMode:
      target.ainewsReminderMode.trim() || guest.ainewsReminderMode.trim() || undefined,
    reminderDnd: target.ainewsReminderDnd || guest.ainewsReminderDnd,
    reminderIntervalMinutes:
      target.ainewsReminderIntervalMinutes || guest.ainewsReminderIntervalMinutes,
    reminderWindowStartHour:
      target.ainewsReminderWindowStartHour || guest.ainewsReminderWindowStartHour,
    reminderWindowEndHour:
      target.ainewsReminderWindowEndHour || guest.ainewsReminderWindowEndHour,
    userTier: target.ainewsUserTier.trim() || guest.ainewsUserTier.trim() || undefined,
    lastSeenIp: target.ainewsLastSeenIp.trim() || guest.ainewsLastSeenIp.trim() || undefined,
  };
}

export function toAinewsEndUserUpdate(
  patch: AinewsProfilePatch,
  now = new Date(),
): Record<string, unknown> {
  const defaultDomains = [...SEED_PRESET_DOMAINS];
  return {
    lastActiveAt: now,
    updatedAt: now,
    ...(patch.deviceId ? { ainewsDeviceId: patch.deviceId.slice(0, 128) } : {}),
    ...(patch.email ? { ainewsEmail: patch.email.slice(0, 320) } : {}),
    ...(patch.timezone !== undefined
      ? { ainewsTimezone: patch.timezone.slice(0, 64) }
      : {}),
    ...(patch.followDomains !== undefined
      ? {
          ainewsFollowDomains:
            patch.followDomains.length > 0 ? patch.followDomains : defaultDomains,
        }
      : {}),
    ...(patch.uiLang !== undefined ? { ainewsUiLang: patch.uiLang.slice(0, 16) } : {}),
    ...(patch.uiTheme !== undefined ? { ainewsUiTheme: patch.uiTheme.slice(0, 16) } : {}),
    ...(patch.systemLanguage !== undefined
      ? { ainewsSystemLanguage: patch.systemLanguage.slice(0, 32) }
      : {}),
    ...(patch.reminderMode !== undefined
      ? { ainewsReminderMode: patch.reminderMode.slice(0, 32) }
      : {}),
    ...(patch.reminderDnd !== undefined ? { ainewsReminderDnd: patch.reminderDnd } : {}),
    ...(patch.reminderIntervalMinutes !== undefined
      ? { ainewsReminderIntervalMinutes: patch.reminderIntervalMinutes }
      : {}),
    ...(patch.reminderWindowStartHour !== undefined
      ? { ainewsReminderWindowStartHour: patch.reminderWindowStartHour }
      : {}),
    ...(patch.reminderWindowEndHour !== undefined
      ? { ainewsReminderWindowEndHour: patch.reminderWindowEndHour }
      : {}),
    ...(patch.userTier ? { ainewsUserTier: patch.userTier.slice(0, 32) } : {}),
    ...(patch.lastSeenIp !== undefined
      ? { ainewsLastSeenIp: patch.lastSeenIp.slice(0, 64) }
      : {}),
  };
}

export async function mergeAinewsGuestIntoEndUser(
  prisma: PrismaClient,
  guestId: string,
  targetId: string,
): Promise<void> {
  if (guestId === targetId) return;

  await prisma.$transaction(async (tx) => {
    const [guest, target] = await Promise.all([
      tx.endUser.findUnique({ where: { id: guestId } }),
      tx.endUser.findUnique({ where: { id: targetId } }),
    ]);
    if (!guest || !target) return;

    const merged = mergeAinewsProfile(target, guest);

    await tx.endUser.update({
      where: { id: targetId },
      data: {
        ...toAinewsEndUserUpdate(merged),
        ainewsLinkedAt: target.ainewsLinkedAt ?? new Date(),
      },
    });

    await remapAinewsUserId(tx, guestId, targetId);

    if (isDeviceGuestUser(guest)) {
      await tx.endUser.delete({ where: { id: guestId } }).catch(() => {});
    }
  });
}

async function remapAinewsUserId(
  prisma: AinewsDb,
  fromId: string,
  toId: string,
): Promise<void> {
  await prisma.ainewsUserPrefsLog.updateMany({
    where: { userId: fromId },
    data: { userId: toId },
  });

  await prisma.ainewsArticleActionEvent.updateMany({
    where: { userId: fromId },
    data: { userId: toId },
  });

  const usageRows = await prisma.ainewsLlmUsageDaily.findMany({
    where: { userId: fromId },
  });
  for (const row of usageRows) {
    await prisma.ainewsLlmUsageDaily.upsert({
      where: {
        userId_usageDay: { userId: toId, usageDay: row.usageDay },
      },
      create: {
        userId: toId,
        usageDay: row.usageDay,
        summarizeCalls: row.summarizeCalls,
      },
      update: {
        summarizeCalls: { increment: row.summarizeCalls },
      },
    });
  }
  await prisma.ainewsLlmUsageDaily.deleteMany({ where: { userId: fromId } });

  const states = await prisma.ainewsArticleUserState.findMany({
    where: { userId: fromId },
  });
  for (const state of states) {
    const existing = await prisma.ainewsArticleUserState.findUnique({
      where: {
        userId_canonicalUrl: { userId: toId, canonicalUrl: state.canonicalUrl },
      },
    });
    if (!existing) {
      await prisma.ainewsArticleUserState.create({
        data: {
          userId: toId,
          canonicalUrl: state.canonicalUrl,
          liked: state.liked,
          disliked: state.disliked,
          read: state.read,
          likeCount: state.likeCount,
          dislikeCount: state.dislikeCount,
          readCount: state.readCount,
          likedAt: state.likedAt,
          dislikedAt: state.dislikedAt,
          readAt: state.readAt,
          updatedAt: state.updatedAt,
        },
      });
      await prisma.ainewsArticleUserState.delete({
        where: {
          userId_canonicalUrl: {
            userId: fromId,
            canonicalUrl: state.canonicalUrl,
          },
        },
      });
      continue;
    }

    await prisma.ainewsArticleUserState.update({
      where: {
        userId_canonicalUrl: { userId: toId, canonicalUrl: state.canonicalUrl },
      },
      data: {
        liked: existing.liked || state.liked,
        disliked: existing.disliked || state.disliked,
        read: existing.read || state.read,
        likeCount: existing.likeCount + state.likeCount,
        dislikeCount: existing.dislikeCount + state.dislikeCount,
        readCount: existing.readCount + state.readCount,
        likedAt: existing.likedAt ?? state.likedAt,
        dislikedAt: existing.dislikedAt ?? state.dislikedAt,
        readAt: existing.readAt ?? state.readAt,
        updatedAt: new Date(),
      },
    });
    await prisma.ainewsArticleUserState.delete({
      where: {
        userId_canonicalUrl: { userId: fromId, canonicalUrl: state.canonicalUrl },
      },
    });
  }
}
