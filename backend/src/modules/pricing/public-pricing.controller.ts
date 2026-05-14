import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  PublicPricingResponseDto,
  SITE_SLUG_QUERY_DESC,
} from '../../common/swagger/public-site-api.dto';
import { PricingService } from './pricing.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 官网定价页拉取（无需 JWT），通过应用 slug 关联 monitor 中的 Application。
 */
@ApiTags('公开定价')
@Controller('public')
export class PublicPricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('pricing')
  @Public()
  @ApiOperation({
    summary: '官网定价数据（无需登录）',
    description: '返回启用中的方案列表 + application.pricing_page 文案',
  })
  @ApiQuery({
    name: 'slug',
    required: true,
    description: SITE_SLUG_QUERY_DESC,
    example: 'clearbg',
  })
  @ApiOkResponse({
    type: PublicPricingResponseDto,
    description: '应用摘要 + pricing_page 配置 + 已启用方案列表',
  })
  @ApiBadRequestResponse({ description: '缺少 query `slug`' })
  @ApiNotFoundResponse({ description: '不存在该 slug 的应用' })
  async getPricing(@Query('slug') slug?: string) {
    const s = slug?.trim();
    if (!s) {
      throw new BadRequestException(
        'Query parameter "slug" is required (application slug)',
      );
    }
    return this.pricingService.getPublicPricingByAppSlug(s);
  }
}
