import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Query `slug`：与 Monitor 应用 Application.slug 一致 */
export const SITE_SLUG_QUERY_DESC =
  '应用 slug，须与后台「应用」中的 **Application.slug** 一致。';

// ─── GET /public/pricing ─────────────────────────────────────

export class PublicPricingAppSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ClearBG' })
  name: string;

  @ApiProperty({ example: 'clearbg' })
  slug: string;
}

export class PublicPricingPlanPublicDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Pro' })
  name: string;

  @ApiProperty({ example: 'pro-monthly' })
  slug: string;

  @ApiProperty({ nullable: true, description: '套餐描述' })
  description: string | null;

  @ApiProperty({ description: '标价（数字）', example: 9.99 })
  price: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    enum: ['monthly', 'quarterly', 'yearly', 'one_time'],
    description:
      '计费周期：monthly=月付；quarterly=季付；yearly=年付；one_time=一次性（常为积分包）',
  })
  billingInterval: string;

  @ApiProperty({ description: '每周期赠送/包含积分数', example: 100 })
  creditsPerCycle: number;

  @ApiProperty({
    description: '功能列表（JSON，常为 string[]）',
    type: 'array',
    items: { type: 'string' },
    example: ['100 credits/mo', 'API access'],
  })
  features: unknown;

  @ApiProperty({
    nullable: true,
    description: '扩展元数据（JSON 对象）',
    type: 'object',
    additionalProperties: true,
  })
  metadata: unknown;

  @ApiProperty({ description: '排序权重，越小越靠前' })
  sortOrder: number;
}

export class PublicPricingResponseDto {
  @ApiProperty({ type: PublicPricingAppSummaryDto })
  app: PublicPricingAppSummaryDto;

  @ApiProperty({
    description:
      '定价页文案与模块配置（来自 application.pricing_page JSON），结构由后台配置决定',
    type: 'object',
    additionalProperties: true,
    example: { heroTitle: 'Pricing', sections: [] },
  })
  pricingPage: Record<string, unknown>;

  @ApiProperty({
    type: PublicPricingPlanPublicDto,
    isArray: true,
    description: '当前应用下 **已启用** 的定价方案列表',
  })
  plans: PublicPricingPlanPublicDto[];
}

// ─── POST /public/payment/linkmepay/collect ─────────────────

export class PublicLinkmePayCollectResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Monitor 内部订单 ID' })
  orderId: string;

  @ApiProperty({ description: '业务订单号（如 LMP-20260421-XXXX）' })
  orderNo: string;

  @ApiProperty({
    description:
      'LinkMePay Create Collect 原始 JSON（含 orderNumber、支付链接 token 等，字段以渠道文档为准）',
    type: 'object',
    additionalProperties: true,
    example: {
      orderNumber: 'LM123456',
      ipnUrl: 'https://…',
      token: '…',
    },
  })
  linkmePay: Record<string, unknown>;
}

// ─── POST /public/client-activity ───────────────────────────

export class PublicClientActivityIngestResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty({ description: '本批次成功写入的条数', example: 3 })
  count: number;
}

// ─── POST /auth/login（管理后台，无需 Bearer）───────────────

export class AdminLoginUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ description: '角色英文名（权限键前缀）' })
  roleName: string;

  @ApiProperty({ description: '角色展示名' })
  roleDisplayName: string;

  @ApiProperty({
    description: '权限字符串数组',
    isArray: true,
    type: String,
    example: ['apps:view', 'apps:edit'],
  })
  permissions: string[];

  @ApiProperty({
    description:
      '可管理的应用 ID 列表；空数组表示可管理全部（依实现为准）',
    isArray: true,
    type: String,
  })
  allowedApps: string[];
}

export class AdminLoginResponseDto {
  @ApiProperty({ description: '管理员 JWT，请求头 Authorization: Bearer …' })
  access_token: string;

  @ApiProperty({ type: AdminLoginUserDto })
  user: AdminLoginUserDto;
}

// ─── POST /v1/colorize ───────────────────────────────────────

export class V1ColorizeResponseDto {
  @ApiProperty({
    description: '上色结果图公网 URL（Replicate 临时链接）',
    example: 'https://replicate.delivery/…/out.png',
  })
  outputUrl: string;
}

// ─── POST /v1/unblur ─────────────────────────────────────────

export class V1UnblurResponseDto {
  @ApiProperty({
    description: '高清结果图公网 URL',
    example: 'https://replicate.delivery/…/out.webp',
  })
  outputUrl: string;

  @ApiProperty({
    enum: ['face', 'general', 'anime'],
    description:
      '本次实际使用的路由：face=人脸/CodeFormer；general=通用超分；anime=动漫超分',
    example: 'general',
  })
  routedType: string;
}

// ─── POST /v1/inpainting ─────────────────────────────────────

export class V1InpaintingResponseDto {
  @ApiProperty({
    description: '物体移除 / 局部补全后的结果图公网 URL',
    example: 'https://replicate.delivery/…/out.png',
  })
  outputUrl: string;
}

// ─── POST /v1/pro-headshot ───────────────────────────────────

export class V1ProHeadshotResponseDto {
  @ApiProperty({
    type: [String],
    description: '专业证件照结果图公网 URL 列表',
    example: ['https://replicate.delivery/…/out1.png'],
  })
  outputUrls: string[];
}

// ─── POST /public/image-generation/generate（同步典型）──────

export class KlingGenerateSyncResponseDto {
  @ApiPropertyOptional({
    description: '异步模式（sync=false）时返回，用于 GET …/tasks/:taskId 轮询',
    example: 'gen:abc123',
  })
  taskId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '同步完成时生成的图片 URL 列表',
    example: ['https://…/1.png'],
  })
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: '可灵查询任务接口返回的 data 封装（结构随官方 API 变化）',
    type: 'object',
    additionalProperties: true,
  })
  task?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '创建任务接口原始响应（调试/兼容）',
    type: 'object',
    additionalProperties: true,
  })
  createResponse?: Record<string, unknown>;
}

/** 图灵兼容壳同步成功时的 results 单项 */
export class TuringCompatResultItemDto {
  @ApiProperty({ example: 1 })
  groupType: number;

  @ApiProperty({ enum: ['image', 'text', 'url'], example: 'image' })
  resultType: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { url: 'https://…/1.png' },
  })
  values: Record<string, unknown>;
}

export class TuringIntentDto {
  @ApiProperty({ example: 0, description: '0 表示成功' })
  code: number;
}

export class TuringCompatSyncResponseDto {
  @ApiProperty({ type: TuringIntentDto })
  intent: TuringIntentDto;

  @ApiProperty({ type: TuringCompatResultItemDto, isArray: true })
  results: TuringCompatResultItemDto[];
}

/** GET …/tasks/:taskId — 可灵官方查询 JSON（字段随官方 API 变化） */
export class KlingTaskStatusEnvelopeDto {
  @ApiPropertyOptional({ example: 0, description: '业务码（若有）' })
  code?: number;

  @ApiPropertyOptional({ example: 'success' })
  message?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      '任务体：常含 task_status（succeed / failed / submitted 等）、task_result',
    example: { task_status: 'succeed', task_id: '…' },
  })
  data?: Record<string, unknown>;
}
