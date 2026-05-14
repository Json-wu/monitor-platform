import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsArray,
  MinLength,
} from 'class-validator';

export class CreateAdminDto {
  @ApiProperty({ description: '登录邮箱', example: 'ops@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '显示姓名' })
  @IsString()
  name: string;

  @ApiProperty({ description: '初始密码（至少 6 位）', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: '角色 UUID' })
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({
    description: '可管理的应用 id 列表；空/不传表示由角色决定',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  allowedApps?: string[];

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateAdminDto {
  @ApiPropertyOptional({ description: '显示姓名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '角色 UUID' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ description: '是否启用账号' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: '可管理应用 id 列表' })
  @IsOptional()
  @IsArray()
  allowedApps?: string[];

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: '新密码（至少 6 位）', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
