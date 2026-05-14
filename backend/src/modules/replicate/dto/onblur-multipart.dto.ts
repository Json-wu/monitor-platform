import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type UpscaleImageType = 'auto' | 'face' | 'general' | 'anime';
export type UpscaleStrength = 'standard' | 'strong';

export class OnblurMultipartFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: ['auto', 'face', 'general', 'anime'], default: 'auto' })
  @IsOptional()
  @IsEnum(['auto', 'face', 'general', 'anime'] as const)
  type?: UpscaleImageType;

  @ApiPropertyOptional({ enum: [2, 4], default: 4 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(4)
  @IsIn([2, 4])
  @Type(() => Number)
  scale?: 2 | 4;

  @ApiPropertyOptional({ enum: ['standard', 'strong'], default: 'standard' })
  @IsOptional()
  @IsEnum(['standard', 'strong'] as const)
  strength?: UpscaleStrength;
}
