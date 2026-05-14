import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ClientActivityEventDto {
  @ApiProperty({ description: '事件分类', example: 'ui' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  category!: string;

  @ApiProperty({ description: '动作名', example: 'pricing_view' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  action!: string;

  @ApiPropertyOptional({ description: '简短标签' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  label?: string;

  @ApiPropertyOptional({ description: '摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(1900)
  summary?: string;

  @ApiPropertyOptional({ description: '附加 JSON' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '发生时间 ISO8601' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class IngestClientActivityDto {
  @ApiProperty({ description: '匿名访客 ID（前端持久化）' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  visitorId!: string;

  @ApiPropertyOptional({ description: '已登录终端用户 UUID' })
  @IsOptional()
  @IsUUID()
  endUserId?: string;

  @ApiProperty({
    type: [ClientActivityEventDto],
    description: '事件批次，最多 50 条',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClientActivityEventDto)
  events!: ClientActivityEventDto[];
}
