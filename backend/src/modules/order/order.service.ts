import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  RefundOrderDto,
} from './dto/order.dto';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  private generateOrderNo(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${date}-${rand}`;
  }

  async create(dto: CreateOrderDto) {
    return this.prisma.order.create({
      data: {
        appId: dto.appId,
        userId: dto.userId,
        orderNo: this.generateOrderNo(),
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        planId: dto.planId,
        creditsGranted: dto.creditsGranted || 0,
      },
    });
  }

  async findAll(
    filters: { appId?: string; userId?: string; status?: string },
    page = 1,
    limit = 20,
  ) {
    const where: Prisma.OrderWhereInput = {};
    if (filters.appId) where.appId = filters.appId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.status) {
      where.status = filters.status as OrderStatus;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true } },
          app: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        app: { select: { id: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    await this.findOne(id);

    const data: Prisma.OrderUpdateInput = { status: dto.status };
    if (dto.gatewayOrderId) data.gatewayOrderId = dto.gatewayOrderId;
    if (dto.gatewayPayload) {
      data.gatewayPayload = dto.gatewayPayload as Prisma.InputJsonValue;
    }
    if (dto.status === 'paid') data.paidAt = new Date();

    return this.prisma.order.update({ where: { id }, data });
  }

  async refund(id: string, dto: RefundOrderDto) {
    const order = await this.findOne(id);
    if (order.status !== 'paid') {
      throw new BadRequestException('Only paid orders can be refunded');
    }

    const maxRefund = Number(order.amount) - Number(order.refundAmount || 0);
    if (dto.amount > maxRefund) {
      throw new BadRequestException(
        `Refund amount exceeds maximum: ${maxRefund}`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status: 'refunded',
        refundAmount: { increment: dto.amount },
        refundReason: dto.reason,
        refundedAt: new Date(),
      },
    });
  }
}
