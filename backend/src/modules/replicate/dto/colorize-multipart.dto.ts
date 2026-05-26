import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

function parseOptionalBooleanField(
  value: unknown,
  defaultValue = false,
): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  }
  return defaultValue;
}

export class ColorizeMultipartFieldsDto {
  @ApiPropertyOptional({
    description:
      '文本形式的图片：公网 https URL、data:image/…;base64,… 或裸 base64；与文件上传二选一',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({
    enum: ['large', 'tiny'],
    description: '对应 Replicate model_size；覆盖集成默认；不传则用集成配置',
  })
  @IsOptional()
  @IsEnum(['large', 'tiny'] as const)
  model?: 'large' | 'tiny';

  @ApiPropertyOptional({
    description: '上色完成后自动划痕/污渍修复（成功后再扣 1 积分）',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseOptionalBooleanField(value, false))
  @IsBoolean()
  clean_scratches?: boolean;

  @ApiPropertyOptional({
    description: '上色（及可选修复）后人脸/模糊转高清（成功后再扣 2 积分）',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseOptionalBooleanField(value, false))
  @IsBoolean()
  face_remaster?: boolean;
}
