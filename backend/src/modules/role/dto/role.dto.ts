import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: '角色标识（英文 slug）', example: 'support' })
  @IsString()
  name: string;

  @ApiProperty({ description: '后台展示名称', example: '客服' })
  @IsString()
  displayName: string;

  @ApiPropertyOptional({
    description:
      '权限矩阵：模块 -> 操作列表，如 { users: ["view","edit"], orders: ["*"] }',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, string[]>;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: '展示名称' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    description: '权限矩阵（全量覆盖）',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, string[]>;
}
