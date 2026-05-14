import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsInt,
  IsString,
  IsEnum,
  IsOptional,
  Min,
} from 'class-validator';
import { CreditType } from '@prisma/client';

export class GrantCreditsDto {
  @ApiProperty({ description: '终端用户 UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: '应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiProperty({ description: '发放积分数量', minimum: 1, example: 100 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({
    enum: CreditType,
    description: '积分池：promo=日/活动 subscription=订阅 payg=按量永久',
  })
  @IsEnum(CreditType)
  creditType: CreditType;

  @ApiProperty({ description: '发放原因（记入流水说明）' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: '外部关联单号/ID' })
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class DeductCreditsDto {
  @ApiProperty({ description: '终端用户 UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: '应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiProperty({ description: '扣减积分数量', minimum: 1 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ description: '扣减原因' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: '外部关联单号/ID' })
  @IsOptional()
  @IsString()
  referenceId?: string;
}
