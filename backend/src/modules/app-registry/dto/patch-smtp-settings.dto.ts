import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PatchSmtpSettingsDto {
  @ApiPropertyOptional({
    description: '是否启用 SMTP 发信（关闭后验证码等邮件将不可用）',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'SMTP 主机' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  host?: string;

  @ApiPropertyOptional({ description: '端口', minimum: 1, maximum: 65535 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ description: '用户名' })
  @IsOptional()
  @IsString()
  user?: string;

  @ApiPropertyOptional({ description: '密码；不传则保留原值' })
  @IsOptional()
  @IsString()
  pass?: string;

  @ApiPropertyOptional({ description: '发件人地址' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'TLS 是否校验证书' })
  @IsOptional()
  @IsBoolean()
  tlsRejectUnauthorized?: boolean;
}
