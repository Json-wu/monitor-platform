import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const ROOM_DECORATION_ROOM_TYPES = [
  'living_room',
  'dining_room',
  'bedroom',
  'bathroom',
  'office',
  'kitchen',
  'basement',
  'outdoor_patio',
  'gaming_room',
] as const;

export const ROOM_DECORATION_QUALITIES = ['standard', 'high', 'ultra'] as const;

export class RoomDecorationGenerateDto {
  @ApiProperty({
    description:
      '参考图：Base64 字符串，或 `data:image/...;base64,...`。上游字段名 `referenceImage`。',
    example: 'data:image/jpeg;base64,/9j/4AAQ…',
  })
  @IsString()
  @MinLength(1)
  referenceImage: string;

  @ApiProperty({
    description:
      '装修主题 ID 列表，1～4 个；服务端会去重且保序。未列于产品表的 ID 也可传，将原样写入提示与结果。',
    type: [String],
    example: ['modern', 'coastal'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  themes: string[];

  @ApiProperty({
    enum: ROOM_DECORATION_ROOM_TYPES,
    example: 'living_room',
  })
  @IsIn([...ROOM_DECORATION_ROOM_TYPES])
  roomType: string;

  @ApiProperty({
    enum: ROOM_DECORATION_QUALITIES,
    example: 'high',
  })
  @IsIn([...ROOM_DECORATION_QUALITIES])
  quality: string;

  @ApiPropertyOptional({
    description: '用户补充说明，≤8000 字符',
    maxLength: 8000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  prompt?: string;

  @ApiPropertyOptional({
    description: '负面提示，≤4000 字符',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  negativePrompt?: string;

  @ApiPropertyOptional({
    description:
      '覆盖可灵 `model_name`（须与单图参考接口兼容）；省略则使用后台「房间装修图默认模型」，再省略则与「0–1 张参考图」默认相同',
    example: 'kling-v2',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomDecorationModelId?: string;

  @ApiPropertyOptional({
    description: '为 true 时服务端轮询任务直至完成或超时（默认 true）',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  sync?: boolean;
}
