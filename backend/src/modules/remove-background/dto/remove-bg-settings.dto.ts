import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** 写入全站 global_integration_setting，name=removeBackground 的 config */
export class PatchRemoveBackgroundSettingsDto {
  @ApiPropertyOptional({
    description:
      '抠图服务 POST 地址，如 https://api.pixian.ai/api/v2/remove-background',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ description: 'Basic 用户名' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  authUser?: string;

  @ApiPropertyOptional({
    description: 'Basic 密码；传空字符串可清空已保存密码',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  authPass?: string;

  @ApiPropertyOptional({ description: '是否启用直连抠图' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
