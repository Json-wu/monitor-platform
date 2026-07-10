import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitFeedbackDto {
  @ApiProperty({ description: '昵称', example: 'Alex' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  nickname!: string;

  @ApiProperty({ description: '联系邮箱', example: 'user@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ description: '主题', example: 'Feature request' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  subject!: string;

  @ApiProperty({ description: '反馈内容' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @ApiPropertyOptional({ description: '已登录终端用户 UUID（可选）' })
  @IsOptional()
  @IsUUID()
  endUserId?: string;
}

export class UpdateFeedbackStatusDto {
  @ApiProperty({
    enum: FeedbackStatus,
    description: '处理状态',
    example: FeedbackStatus.reviewed,
  })
  @IsEnum(FeedbackStatus)
  status!: FeedbackStatus;
}
