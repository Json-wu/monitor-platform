import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  guestEmailForUserId,
  isDeviceGuestUser,
  mergeAinewsGuestIntoEndUser,
  resolveAinewsAppId,
  toAinewsEndUserUpdate,
} from './ainews-end-user.util';
import { SEED_PRESET_DOMAINS } from './rss-config';

export type AinewsAuthSession = {
  endUserId: string;
  email: string | null;
};

export type AinewsResolveProfile = {
  timezone?: string;
  uiLang?: string;
};

type AinewsDb = PrismaClient | Prisma.TransactionClient;

export async function findDeviceGuest(
  prisma: AinewsDb,
  appId: string,
  deviceId: string,
) {
  const trimmed = deviceId.trim();
  if (!trimmed) return null;
  return prisma.endUser.findFirst({
    where: {
      appId,
      ainewsDeviceId: trimmed,
      oauthProvider: 'device',
    },
    orderBy: { lastActiveAt: 'desc' },
  });
}

/** 同一 device 只保留一个访客，其余合并到最新活跃访客。 */
export async function dedupeDeviceGuests(
  prisma: PrismaClient,
  appId: string,
  deviceId: string,
): Promise<string | null> {
  const trimmed = deviceId.trim();
  if (!trimmed) return null;

  const guests = await prisma.endUser.findMany({
    where: {
      appId,
      ainewsDeviceId: trimmed,
      oauthProvider: 'device',
    },
    orderBy: { lastActiveAt: 'desc' },
  });
  if (guests.length === 0) return null;
  const [keep, ...dupes] = guests;
  for (const dup of dupes) {
    if (dup.id === keep.id) continue;
    await mergeAinewsGuestIntoEndUser(prisma, dup.id, keep.id);
  }
  return keep.id;
}

/** 未登录：按 app_id + device_id 唯一访客，有则更新、无则创建。 */
export async function upsertDeviceGuest(
  prisma: PrismaClient,
  deviceId: string,
  profile: AinewsResolveProfile = {},
): Promise<{ userId: string; isNew: boolean }> {
  const trimmed = deviceId.trim();
  const now = new Date();
  const timezone = (profile.timezone ?? '').trim().slice(0, 64);
  const uiLang = (profile.uiLang ?? '').trim().slice(0, 16);
  const defaultDomains = [...SEED_PRESET_DOMAINS];
  const appId = await resolveAinewsAppId(prisma);

  if (!trimmed) {
    const id = randomUUID();
    await prisma.endUser.create({
      data: {
        id,
        appId,
        email: guestEmailForUserId(id),
        oauthProvider: 'device',
        ainewsFollowDomains: defaultDomains,
        ainewsTimezone: timezone,
        ainewsUiLang: uiLang,
        lastActiveAt: now,
      },
    });
    return { userId: id, isNew: true };
  }

  await dedupeDeviceGuests(prisma, appId, trimmed);

  const existing = await findDeviceGuest(prisma, appId, trimmed);
  if (existing) {
    await prisma.endUser.update({
      where: { id: existing.id },
      data: {
        ...toAinewsEndUserUpdate(
          {
            timezone:
              timezone && !existing.ainewsTimezone.trim() ? timezone : undefined,
            uiLang: uiLang && !existing.ainewsUiLang.trim() ? uiLang : undefined,
            followDomains:
              existing.ainewsFollowDomains.length === 0
                ? defaultDomains
                : undefined,
          },
          now,
        ),
      },
    });
    return { userId: existing.id, isNew: false };
  }

  const id = crypto.randomUUID();
  await prisma.endUser.create({
    data: {
      id,
      appId,
      email: guestEmailForUserId(id),
      oauthProvider: 'device',
      oauthId: trimmed,
      ainewsDeviceId: trimmed,
      ainewsFollowDomains: defaultDomains,
      ainewsTimezone: timezone,
      ainewsUiLang: uiLang,
      lastActiveAt: now,
    },
  });
  return { userId: id, isNew: true };
}

/** 已登录：email + app_id + device_id；未登录：app_id + device_id 访客。 */
export async function resolveAinewsUserId(
  prisma: PrismaClient,
  input: {
    deviceId: string;
    session?: AinewsAuthSession | null;
    profile?: AinewsResolveProfile;
  },
): Promise<string> {
  const deviceId = input.deviceId.trim();
  const appId = await resolveAinewsAppId(prisma);
  const profile = input.profile ?? {};

  if (input.session?.email && input.session.endUserId) {
    const email = input.session.email.trim().toLowerCase();

    if (deviceId) {
      const matched = await prisma.endUser.findFirst({
        where: {
          appId,
          email,
          ainewsDeviceId: deviceId,
          oauthProvider: { not: 'device' },
        },
      });
      if (matched) {
        return matched.id;
      }
    }

    const byEmail = await prisma.endUser.findUnique({
      where: { appId_email: { appId, email } },
    });
    if (byEmail && !isDeviceGuestUser(byEmail)) {
      if (deviceId) {
        const guest = await findDeviceGuest(prisma, appId, deviceId);
        if (guest && guest.id !== byEmail.id) {
          await mergeAinewsGuestIntoEndUser(prisma, guest.id, byEmail.id);
        }
        if (byEmail.ainewsDeviceId.trim() !== deviceId) {
          await prisma.endUser.update({
            where: { id: byEmail.id },
            data: {
              ainewsDeviceId: deviceId,
              lastActiveAt: new Date(),
            },
          });
        }
      }
      return byEmail.id;
    }

    return input.session.endUserId;
  }

  const guest = await upsertDeviceGuest(prisma, deviceId, profile);
  return guest.userId;
}
