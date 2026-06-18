import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  upsertDeviceGuest,
  type AinewsResolveProfile,
} from './ainews-user-resolve.util';

export type ResolveAnonProfile = AinewsResolveProfile;

@Injectable()
export class AinewsAnonService {
  constructor(private readonly prisma: PrismaService) {}

  /** 未登录：按 app_id + device_id 解析唯一访客 end_user。 */
  resolveByDeviceId(deviceId: string, profile: ResolveAnonProfile = {}) {
    return upsertDeviceGuest(this.prisma, deviceId, profile);
  }
}
