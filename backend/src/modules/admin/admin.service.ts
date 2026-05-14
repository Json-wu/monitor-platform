import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAdminDto,
  UpdateAdminDto,
  ResetPasswordDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAdminDto) {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already exists');

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.adminUser.create({
      data: {
        ...rest,
        passwordHash,
        allowedApps: dto.allowedApps ?? [],
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isActive: true,
        allowedApps: true,
        createdAt: true,
        role: { select: { id: true, name: true, displayName: true } },
      },
    });
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          isActive: true,
          allowedApps: true,
          lastLoginAt: true,
          createdAt: true,
          role: { select: { id: true, name: true, displayName: true } },
        },
      }),
      this.prisma.adminUser.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isActive: true,
        allowedApps: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { id: true, name: true, displayName: true } },
      },
    });
    if (!admin) throw new NotFoundException('Admin user not found');
    return admin;
  }

  async update(id: string, dto: UpdateAdminDto) {
    await this.findOne(id);
    return this.prisma.adminUser.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isActive: true,
        allowedApps: true,
        createdAt: true,
        role: { select: { id: true, name: true, displayName: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.adminUser.delete({ where: { id } });
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash },
    });
    return { message: 'Password reset successfully' };
  }
}
