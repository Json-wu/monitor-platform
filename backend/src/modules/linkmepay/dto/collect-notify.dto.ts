import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * LinkMePay Collect「Notify Merchant」异步通知请求体（application/json）。
 * 验签与业务处理使用原始 JSON，须保留文档未列出的扩展字段；本类仅用于 OpenAPI 声明。
 *
 * @see https://merchant.linkmepay.com/docs/collect.html#notify-merchant
 */
export class LinkmePayCollectNotifyDto {
  @ApiProperty({
    description:
      '支付状态：0 New · 1 In Progress · 2 Successful · 3 Failed · 4 Timeout',
    example: 2,
    enum: [0, 1, 2, 3, 4],
  })
  state!: number;

  @ApiProperty({
    description: '商户订单号（与创建代收时传入的 biz_no 一致）',
    example: 'LMP-20260413-XXXXXXXX',
  })
  biz_no!: string;

  @ApiProperty({
    description: '平台订单号',
    example: 'linkpay961006786',
  })
  orderNumber!: string;

  @ApiProperty({
    description: '交易金额（最多两位小数）',
    example: 99.99,
  })
  amount!: number;

  @ApiPropertyOptional({
    description: '手续费（最多两位小数）',
    example: 0,
  })
  fee?: number;

  @ApiProperty({
    description: '支付完成时间，13 位 Unix 时间戳（字符串）',
    example: '1734663976000',
  })
  payed_timestamp!: string;

  @ApiPropertyOptional({
    description: '创建订单时商户传入的 uid（若有）',
    example: 'user@example.com',
  })
  uid?: string;

  @ApiPropertyOptional({
    description: '创建订单时传入的 args（若有）',
    example: 'uuid-of-order',
  })
  args?: string;

  @ApiPropertyOptional({
    description: '仅 PYUSD 等场景返回',
  })
  hash?: string;

  @ApiProperty({
    description: '回调时间，13 位 Unix 时间戳（字符串）',
    example: '1734663976000',
  })
  time!: string;

  @ApiProperty({
    description: 'SHA256 签名字符串（验签时排除 signature 后对其余字段签名）',
    example: '...',
  })
  signature!: string;
}

/** 回调原始 JSON（可含渠道扩展字段）；验签须使用完整对象 */
export type LinkmePayCollectNotifyPayload = Record<string, unknown>;
