import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { getClientIp } from '../../common/utils/request.util';

/** 去掉 UTF-8 BOM，避免 .env 首行导致邮箱比对失败 */
function stripEnv(v: string | undefined): string {
  return (v ?? '').replace(/^\uFEFF/, '').trim();
}

function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  private async verifyPasswordHash(
    plain: string,
    passwordHash: string,
  ): Promise<boolean> {
    if (!passwordHash?.trim()) return false;
    try {
      return await bcrypt.compare(plain, passwordHash);
    } catch {
      return false;
    }
  }

  /**
   * 已配置 ADMIN_LOGIN_* 且库中尚无该邮箱时：在存在 `super_admin` 角色的前提下自动建首个管理员。
   * 否则仅迁移未 seed 时会一直 401。
   */
  private async ensureAdminUserFromEnvCredentials(
    envEmail: string,
    plainPassword: string,
  ): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name: 'super_admin' },
    });
    if (!role) {
      throw new UnauthorizedException(
        'Database is not initialized: run `npx prisma db seed`',
      );
    }
    const email = envEmail.toLowerCase();
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    try {
      await this.prisma.adminUser.create({
        data: {
          email,
          name: 'Super Admin',
          passwordHash,
          roleId: role.id,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return;
      }
      throw e;
    }
  }

  async login(dto: LoginDto, req: Request) {
    const envEmail = stripEnv(process.env.ADMIN_LOGIN_EMAIL);
    const envPassword = stripEnv(process.env.ADMIN_LOGIN_PASSWORD);
    const useEnvCredentials = Boolean(envEmail) && envPassword.length > 0;

    const dtoEmailNorm = dto.email.trim().toLowerCase();
    const emailMatchesEnv =
      useEnvCredentials && dtoEmailNorm === envEmail.toLowerCase();
    const passwordMatchesEnv =
      useEnvCredentials && timingSafeStringEqual(dto.password, envPassword);

    let user = await this.prisma.adminUser.findFirst({
      where: {
        email: { equals: dto.email.trim(), mode: 'insensitive' },
      },
      include: { role: true },
    });

    if (!user && emailMatchesEnv && passwordMatchesEnv) {
      await this.ensureAdminUserFromEnvCredentials(envEmail, envPassword);
      user = await this.prisma.adminUser.findFirst({
        where: {
          email: { equals: dto.email.trim(), mode: 'insensitive' },
        },
        include: { role: true },
      });
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');
    if (!user.role) {
      throw new UnauthorizedException(
        'Admin account has no role; run `npx prisma db seed`',
      );
    }

    if (useEnvCredentials) {
      if (emailMatchesEnv && passwordMatchesEnv) {
        // 与部署环境变量一致：信任该凭据，不再比对库内哈希
      } else {
        const valid = await this.verifyPasswordHash(
          dto.password,
          user.passwordHash,
        );
        if (!valid) throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      const valid = await this.verifyPasswordHash(
        dto.password,
        user.passwordHash,
      );
      if (!valid) throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const ip = getClientIp(req);
    try {
      await this.prisma.systemOperationLog.create({
        data: {
          adminId: user.id,
          adminEmail: user.email,
          module: 'auth',
          action: 'login',
          targetType: 'session',
          targetId: user.id,
          summary: `${user.email} logged in`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        },
      });
    } catch {
      // ignore log failure
    }

    const payload = { sub: user.id, email: user.email };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        roleName: user.role.name,
        roleDisplayName: user.role.displayName,
        permissions: user.role.permissions,
        allowedApps: user.allowedApps,
      },
    };
  }

  async logout(adminId: string, adminEmail: string, req: Request) {
    const ip = getClientIp(req);
    try {
      await this.prisma.systemOperationLog.create({
        data: {
          adminId,
          adminEmail,
          module: 'auth',
          action: 'logout',
          targetType: 'session',
          targetId: adminId,
          summary: `${adminEmail} logged out`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        },
      });
    } catch {
      // ignore
    }
    return { ok: true };
  }

  async getProfile(userId: string) {
    try {
      const user = await this.prisma.adminUser.findUnique({
        where: { id: userId },
        include: { role: true },
      });
      if (!user) throw new UnauthorizedException();
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        roleName: user.role.name,
        roleDisplayName: user.role.displayName,
        permissions: user.role.permissions,
        allowedApps: user.allowedApps,
        lastLoginAt: user.lastLoginAt,
      };
    } catch(error) {
      console.error('getProfile error', { userId, error });
      throw new UnauthorizedException();
    }
  }
}
