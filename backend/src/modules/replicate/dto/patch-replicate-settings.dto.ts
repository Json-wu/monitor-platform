import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const VERSION_RE = /^[a-f0-9]{64}$/i;

export class PatchReplicateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeformerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  realEsrganRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  animeUpscalerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blipRef?: string;

  @ApiPropertyOptional({ enum: ['auto', 'face', 'general', 'anime'], default: 'auto' })
  @IsOptional()
  @IsEnum(['auto', 'face', 'general', 'anime'] as const)
  defaultType?: 'auto' | 'face' | 'general' | 'anime';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lamaInpaintRef?: string;

  @ApiPropertyOptional({
    default: 'flux-kontext-apps/professional-headshot',
    description:
      '专业证件照模型引用，建议使用可直接生成职业头像的公开模型（owner/name 或 owner/name:version）',
  })
  @IsOptional()
  @IsString()
  proHeadshotRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(VERSION_RE, { message: 'ddcolorVersion 须为 64 位十六进制版本 ID，或传空字符串使用默认' })
  ddcolorVersion?: string;

  @ApiPropertyOptional({ enum: ['large', 'tiny'] })
  @IsOptional()
  @IsEnum(['large', 'tiny'] as const)
  ddcolorDefaultModelSize?: 'large' | 'tiny';

  @ApiPropertyOptional({
    default: 'topazlabs/dust-and-scratch-v2',
    description: '上色附加「划痕修复」使用的 Replicate 模型引用',
  })
  @IsOptional()
  @IsString()
  scratchRepairRef?: string;
}
