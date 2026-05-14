import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type ProHeadshotSize = '1:1' | '4:5' | '2:3';
export type ProHeadshotBackground = 'white' | 'black' | 'neutral' | 'gray' | 'office';
export type ProHeadshotOutfit = 'business-formal' | 'business-casual' | 'blazer' | 'shirt';
export type ProHeadshotUseCase = 'linkedin' | 'resume' | 'company-profile' | 'id-photo';
export type ProHeadshotOutputs = '1' | '2' | '4';

export class ProHeadshotMultipartFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: ['1:1', '4:5', '2:3'], default: '4:5' })
  @IsOptional()
  @IsEnum(['1:1', '4:5', '2:3'] as const)
  size?: ProHeadshotSize;

  @ApiPropertyOptional({
    enum: ['white', 'black', 'neutral', 'gray', 'office'],
    default: 'neutral',
    description: '背景参数，必须为模型支持值',
  })
  @IsOptional()
  @IsEnum(['white', 'black', 'neutral', 'gray', 'office'] as const)
  background?: ProHeadshotBackground;

  @ApiPropertyOptional({ enum: ['business-formal', 'business-casual', 'blazer', 'shirt'], default: 'business-formal' })
  @IsOptional()
  @IsEnum(['business-formal', 'business-casual', 'blazer', 'shirt'] as const)
  outfit?: ProHeadshotOutfit;

  @ApiPropertyOptional({ enum: ['linkedin', 'resume', 'company-profile', 'id-photo'], default: 'linkedin' })
  @IsOptional()
  @IsEnum(['linkedin', 'resume', 'company-profile', 'id-photo'] as const)
  useCase?: ProHeadshotUseCase;

  @ApiPropertyOptional({ enum: ['1', '2', '4'], default: '1' })
  @IsOptional()
  @IsEnum(['1', '2', '4'] as const)
  outputs?: ProHeadshotOutputs;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 2,
    default: 2,
    description:
      'Safety tolerance，0 最严格，2 最宽松（当前最大值 2）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  safety_tolerance?: number;
}
