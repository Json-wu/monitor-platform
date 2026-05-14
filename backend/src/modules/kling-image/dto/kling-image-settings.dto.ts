import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

const MODEL_SINGLE_EXAMPLES = [
  'kling-v1-5',
  'kling-v2',
  'kling-v2-new',
] as const;
const MODEL_MULTI_EXAMPLES = ['kling-v2', 'kling-v2-1'] as const;

export class PatchKlingImageSettingsDto {
  @ApiPropertyOptional({ description: '是否启用可灵生图代理' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      '可灵开放平台 AccessKey（与 SecretKey 配对；见 document-api 鉴权）。传空字符串可清空。',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  accessKey?: string;

  @ApiPropertyOptional({
    description: '可灵开放平台 SecretKey；传空字符串可清空。',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  secretKey?: string;

  @ApiPropertyOptional({
    description:
      '已废弃：原 DashScope sk-；保留仅便于脚本清空旧字段。请改用 accessKey + secretKey。',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  dashscopeApiKey?: string;

  @ApiPropertyOptional({
    description: `0–1 张参考图时 POST /v1/images/generations 的默认 model_name。示例：${MODEL_SINGLE_EXAMPLES.join(', ')}`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultModelSingle?: string;

  @ApiPropertyOptional({
    description: `2–4 张参考图时 POST /v1/images/multi-image2image 的默认 model_name。示例：${MODEL_MULTI_EXAMPLES.join(', ')}`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultModelMulti?: string;

  @ApiPropertyOptional({
    description:
      '房间装修图 `POST /api/v1/room-decoration/generate`：未传 `roomDecorationModelId` 时使用的 model_name（单图参考 `/v1/images/generations`）。传空字符串则与「0–1 张参考图」默认模型相同。',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultRoomDecorationModel?: string;

  @ApiPropertyOptional({
    description:
      '可灵开放平台 HTTP 根地址，默认 https://api-singapore.klingai.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  baseUrl?: string;
}
