import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '管理员邮箱', example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '密码（至少 6 位）',
    example: 'secret12',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;
}
