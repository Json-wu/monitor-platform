import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { AppStatus, AppEnv } from '@prisma/client';

export class CreateAppDto {
  @ApiProperty({ description: '应用显示名称', example: 'ClearBG' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'URL 友好标识，唯一', example: 'clearbg' })
  @IsString()
  slug: string;

  @ApiProperty({
    description: '主站域名（展示/回调用）',
    example: 'https://clearbg.ai',
  })
  @IsString()
  domain: string;

  @ApiPropertyOptional({ description: 'Logo 图片 URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: '应用说明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: AppStatus, description: '上线状态' })
  @IsOptional()
  @IsEnum(AppStatus)
  status?: AppStatus;

  @ApiPropertyOptional({ enum: AppEnv, description: '运行环境' })
  @IsOptional()
  @IsEnum(AppEnv)
  environment?: AppEnv;

  @ApiPropertyOptional({
    description: 'Google OAuth Web Client ID（终端用户 Google 登录 audience）',
    example: '123.apps.googleusercontent.com',
  })
  @IsOptional()
  @IsString()
  googleClientId?: string;
}

export class UpdateAppDto {
  @ApiPropertyOptional({ description: '应用显示名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '主站域名' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: '应用说明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: AppStatus })
  @IsOptional()
  @IsEnum(AppStatus)
  status?: AppStatus;

  @ApiPropertyOptional({ enum: AppEnv })
  @IsOptional()
  @IsEnum(AppEnv)
  environment?: AppEnv;

  @ApiPropertyOptional({ description: 'Google OAuth Web Client ID' })
  @IsOptional()
  @IsString()
  googleClientId?: string;
}
