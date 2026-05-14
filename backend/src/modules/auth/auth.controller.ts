import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminLoginResponseDto } from '../../common/swagger/public-site-api.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('管理员认证')
// @ApiExcludeController()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: '管理员登录',
    description:
      '返回 JWT `access_token`，后续请求在 Header 携带 `Authorization: Bearer <token>`',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    type: AdminLoginResponseDto,
    description: 'JWT 与管理员资料（角色、权限、可管应用）',
    content: {
      'application/json': {
        examples: {
          success: {
            summary: '登录成功',
            value: {
              access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
              user: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                email: 'admin@example.com',
                name: 'Admin',
                avatarUrl: null,
                roleName: 'super_admin',
                roleDisplayName: '超级管理员',
                permissions: ['apps:view', 'apps:edit'],
                allowedApps: [],
              },
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: '邮箱或密码错误、账号已停用',
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  @Post('logout')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: '登出',
    description: '记录审计并作废服务端会话（若实现）',
  })
  logout(
    @CurrentUser() user: { id: string; email: string },
    @Req() req: Request,
  ) {
    return this.authService.logout(user.id, user.email, req);
  }

  @Get('profile')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '当前管理员资料' })
  getProfile(@CurrentUser() user: { id: string }) {
    return this.authService.getProfile(user.id);
  }
}
