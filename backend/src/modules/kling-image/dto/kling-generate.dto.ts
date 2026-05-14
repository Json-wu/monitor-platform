import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * 简化 JSON 生图：服务端按参考图数量自动选择
 * - 0–1 张：`POST /v1/images/generations`
 * - 2–4 张：`POST /v1/images/multi-image2image`
 * 鉴权为可灵开放平台 JWT（后台配置 AccessKey + SecretKey）。
 */
export class KlingImageGenerateDto {
  @ApiProperty({ description: '正向提示词', maxLength: 2500 })
  @IsString()
  @MinLength(1)
  @MaxLength(2500)
  prompt!: string;

  @ApiPropertyOptional({ description: '反向提示词', maxLength: 2500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2500)
  negative_prompt?: string;

  @ApiPropertyOptional({
    description:
      '参考图：每项为 HTTPS 图片 URL，或 Base64（可带 data:image/...;base64, 前缀；裸 Base64 将按文件头推断 MIME）。0–1 张走单图接口，2–4 张走多图接口',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(20_000_000, { each: true })
  images?: string[];

  @ApiPropertyOptional({
    description:
      '覆盖默认 model_name；不传时单图默认 kling-v1、多图默认 kling-v2（后台「默认可灵模型」仍可覆盖）。须与当前路由匹配，模型列表以可灵文档为准。',
    example: 'kling-v2',
    default: 'kling-v2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @ApiPropertyOptional({ description: '生成张数 1–9', minimum: 1, maximum: 9, 
    default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  n?: number;

  @ApiPropertyOptional({
    description: '宽高比（枚举值：16:9、9:16、1:1、4:3、3:4、3:2、2:3、21:9）',
    default: '1:1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  aspect_ratio?: string;

  @ApiPropertyOptional({
    description: '分辨率（枚举值：1k、2k）',
    default: '1k'
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  resolution?: string;

  @ApiPropertyOptional({
    description: '为 true 时服务端轮询任务直至完成或超时（默认 true）',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  sync?: boolean;
}
