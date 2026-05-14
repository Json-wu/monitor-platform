import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';
import { OrderType, OrderStatus } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({ description: '应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiProperty({ description: '终端用户 UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: OrderType, description: '订单类型' })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiProperty({ description: '订单金额', minimum: 0, example: 9.99 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: '货币，默认 USD', example: 'usd' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: '关联定价方案 UUID（订阅类）' })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ description: '发放的积分数量' })
  @IsOptional()
  @IsNumber()
  creditsGranted?: number;

  @ApiPropertyOptional({ description: '使用的优惠券码' })
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: '新状态' })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: '支付网关侧订单号' })
  @IsOptional()
  @IsString()
  gatewayOrderId?: string;

  @ApiPropertyOptional({ description: '网关原始回调 JSON' })
  @IsOptional()
  gatewayPayload?: any;
}

export class RefundOrderDto {
  @ApiProperty({ description: '退款金额', minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: '退款原因' })
  @IsString()
  reason: string;
}
