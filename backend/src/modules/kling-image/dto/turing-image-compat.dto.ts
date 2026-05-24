import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsObject, IsOptional } from 'class-validator';

/**
 * 图灵机器人 OpenAPI v2 风格壳（仅取 perception / reqType），映射到可灵官方图像接口（按参考图数自动单图/多图）。
 * - perception.inputText.text → 提示词
 * - perception.inputImage：单对象 `{ url }` 或多对象 `{ url }[]` 作为参考图
 * - userInfo 不参与鉴权（公开接口仍使用 X-App-Slug + slug）
 */
export class TuringImageCompatDto {
  @ApiPropertyOptional({ description: '输入类型，0=文本（默认）' })
  @IsOptional()
  @IsNumber()
  reqType?: number;

  @ApiPropertyOptional({ description: '图灵 perception 对象' })
  @IsObject()
  perception!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '图灵 userInfo（可忽略）' })
  @IsOptional()
  @IsObject()
  userInfo?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '是否同步等待结果（默认 true）' })
  @IsOptional()
  @IsBoolean()
  sync?: boolean;

  @ApiPropertyOptional({
    description: '覆盖默认 model_name（可选；须为当前单图/多图接口支持的模型）',
  })
  @IsOptional()
  @IsObject()
  klingParameters?: Record<string, unknown>;
}
