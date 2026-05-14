import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { getClientIp } from '../../common/utils/request.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  async login(dto: LoginDto, req: Request) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

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
