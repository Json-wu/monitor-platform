import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchGumroadSettingsDto {
  @ApiPropertyOptional({ description: '是否启用 Gumroad Ping/Webhook' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Gumroad seller_id，须与 Ping 请求体 seller_id 一致',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sellerId?: string;
}
