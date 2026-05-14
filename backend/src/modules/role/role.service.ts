import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RoleService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Role name already exists');

    return this.prisma.role.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        permissions: dto.permissions ?? {},
        isSystem: false,
      },
    });
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { adminUsers: true } } },
    });
    return {
      data: roles.map((r) => ({
        ...r,
        userCount: r._count.adminUsers,
        _count: undefined,
      })),
    };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { adminUsers: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return { ...role, userCount: role._count.adminUsers, _count: undefined };
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.findOne(id);
    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.permissions !== undefined && { permissions: dto.permissions }),
      },
    });
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system roles');
    }
    if (role.userCount > 0) {
      throw new BadRequestException(
        'Cannot delete role with associated users. Reassign users first.',
      );
    }
    return this.prisma.role.delete({ where: { id } });
  }
}
