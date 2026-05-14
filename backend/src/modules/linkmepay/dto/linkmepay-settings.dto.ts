import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class PatchLinkmePaySettingsDto {
  @ApiPropertyOptional({ description: '是否启用 LinkMePay' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'API 根地址，默认 https://api.linkmepay.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  baseUrl?: string;

  @ApiPropertyOptional({ description: '商户 PID' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  pid?: string;

  @ApiPropertyOptional({ description: '密钥；不传则保留已保存值' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  secretKey?: string;

  @ApiPropertyOptional({ description: '默认 action' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  defaultAction?: string;

  @ApiPropertyOptional({
    description: 'Monitor 公网根 URL，用于拼接异步通知地址',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  notifyPublicBase?: string;
}
