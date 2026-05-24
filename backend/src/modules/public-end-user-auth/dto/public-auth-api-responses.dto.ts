import { ApiProperty } from '@nestjs/swagger';

/** 所有本控制器中带 `?slug=` 的接口共用 */
export const PUBLIC_AUTH_SLUG_DESCRIPTION =
  '应用标识，与 Monitor 后台「应用」里的 **Application.slug** 一致。终端用户在同一 slug 下注册/登录，不同 slug 下账户相互独立。';

/** 订单 type 查询参数说明 */
export const ORDER_TYPE_QUERY_HELP =
  'subscription=订阅套餐；payg=按量充值积分；one_time=单次购买（非订阅）';

/** 订单 status 查询参数说明 */
export const ORDER_STATUS_QUERY_HELP =
  'pending=待支付；paid=已支付；failed=支付失败；refunded=已退款；cancelled=已取消';

/** 分页 query 通用说明 */
export const PUBLIC_PAGE_QUERY = {
  page: {
    name: 'page',
    required: false,
    example: 1,
    description: '页码，从 1 开始',
  },
  limit: {
    name: 'limit',
    required: false,
    example: 20,
    description: '每页条数，默认 20，最大 100',
  },
} as const;

export class SendRegisterCodeResponseDto {
  @ApiProperty({
    example: true,
    description: '已受理发信请求（验证码发往邮箱；具体是否送达取决于 SMTP）',
  })
  sent: boolean;
}

export class VerifyRegisterCodeResponseDto {
  @ApiProperty({
    description:
      '短期 JWT（约 15 分钟），仅用于 `POST /register/complete` 的 `registrationToken` 字段，完成设置密码与昵称',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  registrationToken: string;
}

export class PublicEndUserSubscriptionDto {
  @ApiProperty({
    nullable: true,
    description: '当前订阅账单周期开始（ISO 8601），无订阅时为 null',
    example: '2026-04-01T00:00:00.000Z',
  })
  currentPeriodStart: string | null;

  @ApiProperty({
    nullable: true,
    description: '当前订阅账单周期结束（ISO 8601）',
    example: '2026-05-01T00:00:00.000Z',
  })
  currentPeriodEnd: string | null;

  @ApiProperty({
    enum: ['monthly', 'quarterly', 'yearly', 'one_time'],
    description:
      '计费周期：monthly=月付；quarterly=季付；yearly=年付；one_time=一次性（套餐定义）',
    example: 'monthly',
  })
  billingInterval: string;

  @ApiProperty({
    description: '是否在周期结束时自动续费（cancelAt 为空表示自动续费）',
    example: true,
  })
  autoRenew: boolean;

  @ApiProperty({
    description: '是否为 0 元赠送类套餐（plan.price === 0）',
    example: false,
  })
  isComplimentary: boolean;
}

export class PublicEndUserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'myname' })
  name: string;

  @ApiProperty({
    nullable: true,
    description: '头像 URL（Google 登录等可能有值）',
  })
  avatarUrl: string | null;

  @ApiProperty({
    description: '所属应用 slug，与请求头 `X-App-Slug` 一致',
    example: 'colorizerai',
  })
  appSlug: string;

  @ApiProperty({ description: '账户创建时间 ISO 8601' })
  accountCreatedAt: string;

  @ApiProperty({
    description: '积分总余额（subscription + payg + promo 之和）',
    example: 120,
  })
  credits: number;

  @ApiProperty({ description: '订阅/月度赠送池余额', example: 50 })
  creditsSub: number;

  @ApiProperty({ description: '按量付费（永久）池余额', example: 60 })
  creditsPayg: number;

  @ApiProperty({ description: '每日/活动 promo 池余额', example: 10 })
  creditsPromo: number;

  @ApiProperty({
    description: '当前套餐展示名；无套餐时为「Free」',
    example: 'Pro',
  })
  planLabel: string;

  @ApiProperty({
    nullable: true,
    description: '距离当前订阅周期结束剩余天数（向上取整）；无有效订阅时为 null',
    example: 12,
  })
  planDaysRemaining: number | null;

  @ApiProperty({
    type: PublicEndUserSubscriptionDto,
    nullable: true,
    description: '当前有效订阅摘要；无订阅时为 null',
  })
  subscription: PublicEndUserSubscriptionDto | null;

  @ApiProperty({ description: '是否已生成过 API Key（仅表示是否存在，不包含明文）' })
  hasApiKey: boolean;

  @ApiProperty({
    nullable: true,
    description:
      '脱敏后的终端用户 API Key（如 `cbu_****xxxx`）；未生成过为 null。完整密钥仅在 generate/regenerate 响应中出现一次',
    example: 'cbu_****abcd',
  })
  apiKeyMasked: string | null;

  @ApiProperty({
    description: '是否可使用邮箱密码登录（未设置过密码的纯 Google 账号为 false）',
  })
  canChangePassword: boolean;
}

export class AccessTokenAndUserResponseDto {
  @ApiProperty({
    description:
      '终端用户 JWT，有效期约 7 天。请求头：`Authorization: Bearer <access_token>`',
  })
  access_token: string;

  @ApiProperty({ type: PublicEndUserProfileDto })
  user: PublicEndUserProfileDto;
}

export class MeResponseDto {
  @ApiProperty({ type: PublicEndUserProfileDto })
  user: PublicEndUserProfileDto;
}

export class PublicOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: '业务订单号（唯一）', example: 'ORD202604210001' })
  orderNo: string;

  @ApiProperty({
    enum: ['subscription', 'payg', 'one_time'],
    description: `订单类型。${ORDER_TYPE_QUERY_HELP}`,
  })
  type: string;

  @ApiProperty({
    enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
    description: `订单状态。${ORDER_STATUS_QUERY_HELP}`,
  })
  status: string;

  @ApiProperty({ description: '实付金额（数字）', example: 9.99 })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    nullable: true,
    description: '优惠金额；无优惠为 null',
  })
  discountAmount: number | null;

  @ApiProperty({
    nullable: true,
    description: '优惠前原价（有优惠时 = amount + discountAmount）',
  })
  originalAmount: number | null;

  @ApiProperty({
    description: '本单发放的积分数量（套餐/充值类订单）',
    example: 100,
  })
  creditsGranted: number;

  @ApiProperty({
    description: '展示用商品标题（由类型与关联套餐推导）',
    example: 'Pro 月付',
  })
  productTitle: string;

  @ApiProperty({
    nullable: true,
    description: '展示用副标题（如套餐描述）',
  })
  productSubtitle: string | null;

  @ApiProperty({
    description: '支付网关标识',
    example: 'linkmepay',
  })
  gateway: string;

  @ApiProperty({
    nullable: true,
    description: '支付完成时间 ISO 8601；未支付为 null',
  })
  paidAt: string | null;

  @ApiProperty({ description: '下单时间 ISO 8601' })
  createdAt: string;
}

export class PublicOrdersListResponseDto {
  @ApiProperty({ type: PublicOrderItemDto, isArray: true })
  items: PublicOrderItemDto[];

  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class ApiKeyRevealResponseDto {
  @ApiProperty({
    description:
      '完整 API Key（仅本响应返回一次，请立即保存）。格式通常以 `cbu_` 开头',
    example: 'cbu_xxxxxxxxxxxxxxxx',
  })
  apiKey: string;

  @ApiProperty({
    description: '安全提示文案（英文）',
    example:
      'Save this key now. It will only be shown once; later you will only see a masked value.',
  })
  warning: string;
}
