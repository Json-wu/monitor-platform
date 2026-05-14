import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateLinkmePayCollectDto {
  @ApiProperty({
    description: '定价方案 UUID（pricing_plan.id），须属于当前应用且已启用',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  planId!: string;

  @ApiProperty({
    description: '付款终端用户 UUID（end_user.id），须属于当前应用且为 active',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  payerId!: string;

  @ApiProperty({
    description:
      '购买数量。按量（one_time）方案：金额 = 单价 × 数量，积分 = credits_per_cycle × 数量；订阅类方案须传 1。',
    minimum: 1,
    maximum: 5000,
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  quantity!: number;
}
