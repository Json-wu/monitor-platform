import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}
