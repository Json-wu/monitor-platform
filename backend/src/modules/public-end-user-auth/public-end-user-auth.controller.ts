import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PublicEndUserAuthService } from './public-end-user-auth.service';
import {
  CompleteRegisterDto,
  EndUserLoginDto,
  GoogleIdTokenDto,
  SendRegisterCodeDto,
  VerifyRegisterCodeDto,
} from './dto/public-end-user-auth.dto';
import {
  PUBLIC_CREDIT_POOL_QUERY_HELP,
  PUBLIC_CREDIT_TX_TYPE_QUERY_HELP,
  PublicCreditTransactionsListResponseDto,
} from './dto/credit-transactions-response.dto';
import {
  AccessTokenAndUserResponseDto,
  ApiKeyRevealResponseDto,
  MeResponseDto,
  ORDER_STATUS_QUERY_HELP,
  ORDER_TYPE_QUERY_HELP,
  PUBLIC_AUTH_SLUG_DESCRIPTION,
  PUBLIC_PAGE_QUERY,
  PublicOrdersListResponseDto,
  SendRegisterCodeResponseDto,
  VerifyRegisterCodeResponseDto,
} from './dto/public-auth-api-responses.dto';

const END_USER_AUTH_HEADER = {
  name: 'Authorization',
  required: true,
  description:
    '终端用户会话：`Bearer <access_token>`。`access_token` 来自 `login` / `register/complete` / `google` 响应。',
};

/**
 * 终端用户注册 / 登录（按应用 slug），与 Admin JWT 无关。
 * 路径前缀：/api/public/auth
 */
@ApiTags('终端用户（公开）')
@Controller('public/auth')
export class PublicEndUserAuthController {
  constructor(private readonly auth: PublicEndUserAuthService) {}

  @Post('register/send-code')
  @Public()
  @ApiOperation({
    summary: '发送邮箱注册验证码',
    description:
      '向 `email` 发送 6 位数字验证码（依赖全站 SMTP）。**Query** 必须带 `slug`。\n\n' +
      '- 同一邮箱+应用若已注册：400\n' +
      '- 发码冷却期内重复请求：429\n' +
      '- `slug` 无效或应用不可用：400',
  })
  @ApiQuery({
    name: 'slug',
    required: true,
    description: PUBLIC_AUTH_SLUG_DESCRIPTION,
    example: 'clearbg',
  })
  @ApiBody({
    type: SendRegisterCodeDto,
    description: '仅 `email` 字段',
  })
  @ApiOkResponse({
    type: SendRegisterCodeResponseDto,
    description: '已受理',
    content: {
      'application/json': {
        example: { sent: true },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '应用不可用、或该邮箱在本应用下已注册',
  })
  @ApiTooManyRequestsResponse({ description: '发码过于频繁，请稍后再试' })
  sendCode(@Query('slug') slug: string, @Body() dto: SendRegisterCodeDto) {
    return this.auth.sendRegisterCode(slug, dto);
  }

  @Post('register/verify-code')
  @Public()
  @ApiOperation({
    summary: '校验邮箱验证码',
    description:
      '校验通过后返回 `registrationToken`（短期 JWT），用于下一步 `register/complete`。\n\n' +
      '- 验证码错误或过期：400\n' +
      '- 尝试次数过多：400（需重新 `send-code`）',
  })
  @ApiQuery({
    name: 'slug',
    required: true,
    description: PUBLIC_AUTH_SLUG_DESCRIPTION,
    example: 'clearbg',
  })
  @ApiBody({ type: VerifyRegisterCodeDto })
  @ApiOkResponse({
    type: VerifyRegisterCodeResponseDto,
    content: {
      'application/json': {
        example: {
          registrationToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: '验证码无效、过期或尝试次数超限' })
  verifyCode(@Query('slug') slug: string, @Body() dto: VerifyRegisterCodeDto) {
    return this.auth.verifyRegisterCode(slug, dto);
  }

  @Post('register/complete')
  @Public()
  @ApiOperation({
    summary: '完成注册（设置密码与昵称）',
    description:
      '使用 `verify-code` 返回的 `registrationToken` 完成账户创建，并返回与登录相同的 `access_token` + `user`。\n\n' +
      '- `acceptTerms` 须为 true；密码须与确认一致且满足强度\n' +
      '- token 过期或无效：400\n' +
      '- 邮箱已被注册：400',
  })
  @ApiQuery({
    name: 'slug',
    required: true,
    description: PUBLIC_AUTH_SLUG_DESCRIPTION,
    example: 'clearbg',
  })
  @ApiBody({ type: CompleteRegisterDto })
  @ApiOkResponse({
    type: AccessTokenAndUserResponseDto,
    description: '注册成功，已登录',
  })
  @ApiBadRequestResponse({
    description: '条款未接受、密码不一致、token 无效/过期、邮箱已存在、密码强度不足等',
  })
  completeRegister(
    @Query('slug') slug: string,
    @Body() dto: CompleteRegisterDto,
  ) {
    return this.auth.completeRegister(slug, dto);
  }

  @Post('login')
  @Public()
  @ApiOperation({
    summary: '邮箱密码登录',
    description:
      '**Query**：`slug` 指定应用。**Body**：`email`、`password`。\n\n' +
      '- 账号不存在、禁用或密码错误：401（统一文案，防枚举）\n' +
      '- 纯 Google 账户未设密码：401，提示使用 Google 登录',
  })
  @ApiQuery({
    name: 'slug',
    required: true,
    description: PUBLIC_AUTH_SLUG_DESCRIPTION,
    example: 'clearbg',
  })
  @ApiBody({ type: EndUserLoginDto })
  @ApiOkResponse({
    type: AccessTokenAndUserResponseDto,
    description: '登录成功',
  })
  @ApiUnauthorizedResponse({ description: '邮箱或密码错误、账户不可用、或无密码仅支持 Google' })
  login(@Query('slug') slug: string, @Body() dto: EndUserLoginDto) {
    return this.auth.login(slug, dto);
  }

  @Post('google')
  @Public()
  @ApiOperation({
    summary: 'Google id_token 登录或注册',
    description:
      '**Body**：`idToken` 为 Google 返回的 **id_token**。应用须在后台配置 **Google Client ID**；未配置返回 400。\n\n' +
      '- 首次：可自动创建用户并建立积分账户\n' +
      '- 已存在邮箱但绑定其他 OAuth：400\n' +
      '- 验签失败：401',
  })
  @ApiQuery({
    name: 'slug',
    required: true,
    description: PUBLIC_AUTH_SLUG_DESCRIPTION,
    example: 'clearbg',
  })
  @ApiBody({ type: GoogleIdTokenDto })
  @ApiOkResponse({
    type: AccessTokenAndUserResponseDto,
    description: '登录或注册成功',
  })
  @ApiBadRequestResponse({
    description: '本应用未开启 Google 登录、或邮箱与其他登录方式冲突',
  })
  @ApiUnauthorizedResponse({ description: 'id_token 校验失败' })
  google(@Query('slug') slug: string, @Body() dto: GoogleIdTokenDto) {
    return this.auth.googleLogin(slug, dto);
  }

  @Get('credit-transactions')
  @Public()
  @ApiOperation({
    summary: '当前用户积分流水',
    description:
      '需 Header：`Authorization: Bearer <终端用户 JWT>`。\n\n' +
      '**响应**：分页对象；`items[].description` 为原因码（与库表 `reason` 一致）。\n\n' +
      '**查询枚举**：`type` — ' +
      PUBLIC_CREDIT_TX_TYPE_QUERY_HELP +
      '；`creditType` — ' +
      PUBLIC_CREDIT_POOL_QUERY_HELP +
      '。',
  })
  @ApiOkResponse({
    description: '成功',
    type: PublicCreditTransactionsListResponseDto,
    content: {
      'application/json': {
        examples: {
          default: {
            summary: '分页 + 单条扣费示例',
            value: {
              items: [
                {
                  id: '550e8400-e29b-41d4-a716-446655440000',
                  type: 'deduct',
                  creditType: 'payg',
                  amount: -1,
                  description: 'clearbg.api.deduct',
                  createdAt: '2026-04-21T10:00:00.000Z',
                },
                {
                  id: '660e8400-e29b-41d4-a716-446655440001',
                  type: 'deduct',
                  creditType: 'payg',
                  amount: -1,
                  description: 'upscale.api.deduct',
                  createdAt: '2026-04-21T10:05:00.000Z',
                },
                {
                  id: '770e8400-e29b-41d4-a716-446655440002',
                  type: 'refund',
                  creditType: 'payg',
                  amount: 1,
                  description: 'upscale.api.refund',
                  createdAt: '2026-04-21T10:06:00.000Z',
                },
              ],
              total: 3,
              page: 1,
              limit: 20,
              totalPages: 1,
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未登录或 token 无效' })
  @ApiHeader({ ...END_USER_AUTH_HEADER, required: false })
  @ApiQuery(PUBLIC_PAGE_QUERY.page)
  @ApiQuery(PUBLIC_PAGE_QUERY.limit)
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['grant', 'deduct', 'purchase', 'expire', 'refund'],
    description: `筛选交易类型。${PUBLIC_CREDIT_TX_TYPE_QUERY_HELP}`,
  })
  @ApiQuery({
    name: 'creditType',
    required: false,
    enum: ['promo', 'subscription', 'payg'],
    description: `筛选积分池。${PUBLIC_CREDIT_POOL_QUERY_HELP}`,
  })
  creditTransactions(
    @Headers('authorization') authorization?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('type') type?: string,
    @Query('creditType') creditType?: string,
  ) {
    const raw = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    return this.auth.listMyCreditTransactions(raw, {
      page,
      limit,
      type,
      creditType,
    });
  }

  @Get('me')
  @Public()
  @ApiOperation({
    summary: '当前终端用户资料',
    description:
      '需 `Authorization: Bearer <终端用户 JWT>`。\n\n' +
      '返回 `user`：含积分分池、`planLabel`、订阅摘要、`appSlug`（与 `X-App-Slug` 同源）、`apiKeyMasked`（终端用户 API Key 脱敏，明文仅在 generate/regenerate 出现一次）。',
  })
  @ApiOkResponse({ type: MeResponseDto, description: '当前会话用户' })
  @ApiUnauthorizedResponse({
    description: '未携带 token、token 过期、用户不存在或已禁用',
  })
  @ApiHeader({ ...END_USER_AUTH_HEADER, required: false })
  me(@Headers('authorization') authorization?: string) {
    const raw = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    return this.auth.getSessionFromBearer(raw);
  }

  @Get('orders')
  @Public()
  @ApiOperation({
    summary: '当前用户订单列表',
    description:
      '需 Bearer 终端用户 JWT。返回营销站「我的订单」分页数据：含订单类型、状态、金额、赠送积分、展示标题等。\n\n' +
      '**筛选**：`type`、`status` 仅接受枚举值，非法值将被忽略（不报错）。',
  })
  @ApiOkResponse({ type: PublicOrdersListResponseDto, description: '分页订单' })
  @ApiUnauthorizedResponse({ description: '未登录或 token 无效' })
  @ApiHeader({ ...END_USER_AUTH_HEADER, required: false })
  @ApiQuery(PUBLIC_PAGE_QUERY.page)
  @ApiQuery(PUBLIC_PAGE_QUERY.limit)
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['subscription', 'payg', 'one_time'],
    description: `筛选订单类型。${ORDER_TYPE_QUERY_HELP}`,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
    description: `筛选订单状态。${ORDER_STATUS_QUERY_HELP}`,
  })
  orders(
    @Headers('authorization') authorization?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const raw = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    return this.auth.listMyOrders(raw, {
      page,
      limit,
      type,
      status,
    });
  }

  @Post('api-key/generate')
  @Public()
  @ApiOperation({
    summary: '首次生成终端用户 API Key',
    description:
      '仅当当前用户**尚未**拥有 API Key 时可调用；成功响应中的 `apiKey` 为**完整密钥**，仅出现一次，请客户端妥善保存。\n\n' +
      '已存在 Key：400，请使用 `api-key/regenerate`。',
  })
  @ApiOkResponse({
    type: ApiKeyRevealResponseDto,
    description: '返回完整密钥与提示',
    content: {
      'application/json': {
        example: {
          apiKey: 'cbu_xxxxxxxxxxxxxxxx',
          warning:
            'Save this key now. It will only be shown once; later you will only see a masked value.',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未登录或 token 无效' })
  @ApiBadRequestResponse({ description: '已存在 API Key，需先使用重新生成接口' })
  @ApiHeader({ ...END_USER_AUTH_HEADER, required: false })
  generateApiKey(@Headers('authorization') authorization?: string) {
    const raw = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    return this.auth.generateApiKey(raw);
  }

  @Post('api-key/regenerate')
  @Public()
  @ApiOperation({
    summary: '重新生成终端用户 API Key',
    description:
      '旧 Key **立即作废**。响应中的 `apiKey` 为新完整密钥，仅出现一次。\n\n' +
      '若从未生成过 Key：400，请先调用 `api-key/generate`。',
  })
  @ApiOkResponse({
    type: ApiKeyRevealResponseDto,
    description: '返回新完整密钥与提示',
  })
  @ApiUnauthorizedResponse({ description: '未登录或 token 无效' })
  @ApiBadRequestResponse({ description: '当前无 API Key，请先调用首次生成接口' })
  @ApiHeader({ ...END_USER_AUTH_HEADER, required: false })
  regenerateApiKey(@Headers('authorization') authorization?: string) {
    const raw = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    return this.auth.regenerateApiKey(raw);
  }
}
