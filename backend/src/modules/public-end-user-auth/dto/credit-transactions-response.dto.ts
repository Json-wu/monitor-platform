import { ApiProperty } from '@nestjs/swagger';

/** 供 Swagger 展示：`type` 查询参数含义 */
export const PUBLIC_CREDIT_TX_TYPE_QUERY_HELP =
  'grant=发放/赠送；deduct=扣减使用；expire=过期或周期清零；refund=失败退回等；purchase=购买入账';

/** 供 Swagger 展示：`creditType` 查询参数含义 */
export const PUBLIC_CREDIT_POOL_QUERY_HELP =
  'promo=每日/活动赠送池；subscription=订阅周期赠送池；payg=按量付费余额';

const TRANSACTION_TYPE_FIELD_HELP =
  'grant：发放/赠送（如每日免费、订阅赠送）；deduct：扣减（调用公开 API 等）；expire：过期或账单周期清零；refund：退回（上游失败等）；purchase：购买套餐/积分入账';

const CREDIT_TYPE_FIELD_HELP =
  'promo：每日/活动赠送池；subscription：订阅周期赠送池；payg：按量付费（永久）余额';

const REASON_FIELD_HELP =
  '与库表 reason 一致，供各端本地化。常见：clearbg.api.deduct|refund（抠图）；kling_image.api.deduct|refund（可灵生图）；ddcolor.api.deduct|refund（上色）；upscale.api.deduct|refund（超分，可能多条流水对应一次扣 3 分）；room_decoration.api.deduct|refund（房间装修图/可灵，按主题数 1～4 分）；scheduler.daily_promo_reset；scheduler.monthly_sub_expire';

/** 单条积分流水（营销站「我的积分」列表项） */
export class PublicCreditTransactionItemDto {
  @ApiProperty({
    format: 'uuid',
    description: '流水记录 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    enum: ['grant', 'deduct', 'expire', 'refund', 'purchase'],
    description: `交易类型。${TRANSACTION_TYPE_FIELD_HELP}`,
    example: 'deduct',
  })
  type: string;

  @ApiProperty({
    enum: ['subscription', 'payg', 'promo'],
    description: `本次变动所涉积分池。${CREDIT_TYPE_FIELD_HELP}`,
    example: 'payg',
  })
  creditType: string;

  @ApiProperty({
    description:
      '变动数量：扣减为负数（如 -1；超分 strong 可能连续多条 -1 合计 -3），发放/退回到账为正数',
    example: -1,
  })
  amount: number;

  @ApiProperty({
    description: `业务原因码（响应字段名为 description，对应库表 reason）。${REASON_FIELD_HELP}`,
    example: 'upscale.api.deduct',
  })
  description: string;

  @ApiProperty({
    description: '创建时间 ISO 8601（UTC）',
    example: '2026-04-21T10:00:00.000Z',
  })
  createdAt: string;
}

/** GET /public/auth/credit-transactions 分页响应 */
export class PublicCreditTransactionsListResponseDto {
  @ApiProperty({
    type: PublicCreditTransactionItemDto,
    isArray: true,
    description: '流水列表，按 createdAt 倒序',
  })
  items: PublicCreditTransactionItemDto[];

  @ApiProperty({ example: 42, description: '符合筛选条件的总条数' })
  total: number;

  @ApiProperty({ example: 1, description: '当前页码（从 1 起）' })
  page: number;

  @ApiProperty({ example: 20, description: '每页条数（最大 100）' })
  limit: number;

  @ApiProperty({ example: 3, description: '总页数' })
  totalPages: number;
}
