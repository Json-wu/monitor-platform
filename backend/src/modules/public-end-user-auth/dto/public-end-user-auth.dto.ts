import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class SendRegisterCodeDto {
  @ApiProperty({
    description: '接收验证码的邮箱（将规范化小写）；若该邮箱在本应用下已注册则返回 400',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;
}

export class VerifyRegisterCodeDto {
  @ApiProperty({
    description: '邮箱，须与 `send-code` 时一致',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '邮件中的 6 位数字验证码；错误会累计尝试次数，超限需重新发码',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}

export class CompleteRegisterDto {
  @ApiProperty({
    description:
      '`verify-code` 成功响应中的 `registrationToken`（短期 JWT，约 15 分钟内有效）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @MinLength(1)
  registrationToken: string;

  @ApiProperty({
    description:
      '显示昵称：3–50 字符，仅允许字母、数字及 `.` `_` `@` `-`（不含空格）',
    example: 'myname',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9._@-]+$/, {
    message:
      'Display name must be 3–50 characters and only use letters, digits, and . _ @ -',
  })
  name: string;

  @ApiProperty({
    description: '登录密码，至少 8 位（服务端会校验强度策略）',
    minLength: 8,
    example: 'yourSecurePass8',
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: '须与 `password` 完全一致',
    minLength: 8,
    example: 'yourSecurePass8',
  })
  @IsString()
  @MinLength(8)
  passwordConfirm: string;

  @ApiProperty({
    description: '是否已阅读并接受服务条款与隐私政策；为 false 时返回 400',
    example: true,
  })
  @IsBoolean()
  acceptTerms: boolean;
}

export class EndUserLoginDto {
  @ApiProperty({
    description: '注册时使用的邮箱',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '账户密码（纯 Google 注册且未设密码的账户需走 Google 登录）',
    example: 'yourSecurePass8',
  })
  @IsString()
  @MinLength(1)
  password: string;
}

export class GoogleIdTokenDto {
  @ApiProperty({
    description:
      'Google 登录后前端拿到的 **id_token**（非 access_token）。需与应用后台配置的 Google OAuth Client ID 对应；audience 校验失败返回 401',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  idToken: string;
}
