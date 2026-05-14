import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { NotificationChannel, TriggerEvent } from '@prisma/client';

export class CreateNotificationTemplateDto {
  @ApiProperty({ description: '应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiProperty({ description: '模板名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '模板唯一 slug' })
  @IsString()
  slug: string;

  @ApiProperty({ enum: NotificationChannel, description: '渠道' })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiPropertyOptional({ description: '主题（邮件等）' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: '正文或模板内容' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: '变量定义（JSON）' })
  @IsOptional()
  variables?: unknown;

  @ApiPropertyOptional({ enum: TriggerEvent, description: '触发事件' })
  @IsOptional()
  @IsEnum(TriggerEvent)
  triggerEvent?: TriggerEvent;

  @ApiPropertyOptional({ description: 'Webhook 地址（渠道为 webhook 时）' })
  @IsOptional()
  @IsString()
  webhookUrl?: string;
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional({ description: '模板名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '主题' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: '正文' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: '变量定义' })
  @IsOptional()
  variables?: unknown;

  @ApiPropertyOptional({ enum: TriggerEvent, description: '触发事件' })
  @IsOptional()
  @IsEnum(TriggerEvent)
  triggerEvent?: TriggerEvent;

  @ApiPropertyOptional({ description: 'Webhook 地址' })
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: NotificationChannel, description: '渠道' })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}

export class SendBroadcastDto {
  @ApiProperty({ description: '应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiPropertyOptional({ description: '使用的模板 UUID' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiProperty({ enum: NotificationChannel, description: '发送渠道' })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiPropertyOptional({ description: '指定用户 UUID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  userIds?: string[];

  @ApiPropertyOptional({ description: '主题覆盖' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: '正文内容' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: 'Webhook 覆盖' })
  @IsOptional()
  @IsString()
  webhookUrl?: string;
}
