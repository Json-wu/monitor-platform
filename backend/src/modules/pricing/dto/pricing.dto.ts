import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
  IsObject,
} from 'class-validator';
import { BillingInterval, CouponType } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty({ description: '所属应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiProperty({ description: '方案名称', example: 'Pro' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'URL 友好 slug，应用内唯一', example: 'pro' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({
    description: '营销短描述；可传 null 清空',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: BillingInterval, description: '计费周期' })
  @IsEnum(BillingInterval)
  billingInterval: BillingInterval;

  @ApiProperty({ description: '标价（Decimal）', example: 9.99, minimum: 0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: '货币代码',
    example: 'usd',
    default: 'usd',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: '每周期积分配额', example: 150, minimum: 0 })
  @IsInt()
  @Min(0)
  creditsPerCycle: number;

  @ApiPropertyOptional({ description: '功能列表 JSON 数组' })
  @IsOptional()
  features?: any;

  @ApiPropertyOptional({ description: '限额等 JSON 对象' })
  @IsOptional()
  limits?: any;

  @ApiPropertyOptional({ description: 'Stripe Price ID（若对接）' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({
    description:
      '卡片展示元数据：highlight、badge、creditsLine、perImageLine、ctaLabel、ctaHref、planIconPreset 等',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '展示序号，越小越靠前；不传则自动排在同应用已有方案之后',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: '方案名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: '营销短描述；传 null 可清空',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: BillingInterval })
  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @ApiPropertyOptional({ description: '货币代码' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: '是否上架' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '标价', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: '每周期积分', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditsPerCycle?: number;

  @ApiPropertyOptional()
  @IsOptional()
  features?: any;

  @ApiPropertyOptional()
  @IsOptional()
  limits?: any;

  @ApiPropertyOptional({ description: '展示序号，越小越靠前' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/** 合并写入 application.pricing_page — 与 web 定价页顶区、按次付费文案一致。 */
export class UpdatePricingPagePreviewDto {
  @ApiPropertyOptional({ description: '顶部营销胶囊文案' })
  @IsOptional()
  @IsString()
  marketingPill?: string;

  @ApiPropertyOptional({ description: '标题前半（普通色）' })
  @IsOptional()
  @IsString()
  headingPrefix?: string;

  @ApiPropertyOptional({ description: '标题高亮词（渐变）' })
  @IsOptional()
  @IsString()
  headingAccent?: string;

  @ApiPropertyOptional({ description: '副标题段落' })
  @IsOptional()
  @IsString()
  subheading?: string;

  @ApiPropertyOptional({ description: '按量付费区块标题' })
  @IsOptional()
  @IsString()
  payAsYouGoTitle?: string;

  @ApiPropertyOptional({ description: '按量说明：价格前的句子' })
  @IsOptional()
  @IsString()
  payAsYouGoLead?: string;

  @ApiPropertyOptional({ description: '按量说明：价格粗体部分' })
  @IsOptional()
  @IsString()
  payAsYouGoPrice?: string;

  @ApiPropertyOptional({ description: '按量说明：价格后的句子' })
  @IsOptional()
  @IsString()
  payAsYouGoTrail?: string;

  @ApiPropertyOptional({ description: '按量区块按钮文案' })
  @IsOptional()
  @IsString()
  payAsYouGoCta?: string;
}

export class CreateCouponDto {
  @ApiProperty({ description: '所属应用 UUID' })
  @IsUUID()
  appId: string;

  @ApiProperty({ description: '优惠码字符串', example: 'SUMMER20' })
  @IsString()
  code: string;

  @ApiProperty({ enum: CouponType, description: '优惠券类型' })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({ description: '面值（含义依 type 而定）', minimum: 0 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ description: '最大使用次数' })
  @IsOptional()
  @IsInt()
  maxUses?: number;

  @ApiProperty({ description: '生效时间 ISO8601' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({ description: '失效时间 ISO8601；空表示不限' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
