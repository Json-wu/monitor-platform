import {
  BadRequestException,
  Body,
  Controller,
  Headers,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  PublicLinkmePayCollectResponseDto,
  SITE_APP_SLUG_HEADER_DESC,
  SITE_SLUG_QUERY_DESC,
} from '../../common/swagger/public-site-api.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { LinkmePayService } from './linkmepay.service';
import { CreateLinkmePayCollectDto } from './dto/create-collect.dto';

@ApiTags('公开 · LinkMePay')
@Controller('public/payment')
export class PublicLinkmePayController {
  constructor(
    private readonly linkmePay: LinkmePayService,
    private readonly appGate: RemoveBackgroundService,
  ) {}

  /**
   * 创建订阅类代收订单并调用 LinkMePay Create Collect，返回渠道响应（含 orderNumber、ipnUrl、token 等，用于前端展示支付）。
   * 鉴权：Query slug + Header X-App-Slug
   */
  @Post('linkmepay/collect')
  @ApiOperation({
    summary: '创建 LinkMePay 代收订单',
    description:
      'Query `slug` + Header `X-App-Slug` 鉴权。Body 仅 `planId`、`payerId`（终端用户 UUID）、`quantity`（订阅类须为 1）。',
  })
  @ApiQuery({ name: 'slug', required: true, description: SITE_SLUG_QUERY_DESC })
  @ApiHeader({
    name: 'x-app-slug',
    required: true,
    description: SITE_APP_SLUG_HEADER_DESC,
  })
  @ApiBody({ type: CreateLinkmePayCollectDto })
  @ApiOkResponse({
    type: PublicLinkmePayCollectResponseDto,
    description: '内部订单号 + LinkMePay Create Collect 渠道 JSON',
  })
  @ApiBadRequestResponse({
    description: 'slug 缺失、方案无效、quantity 非 1（订阅类）等',
  })
  @ApiUnauthorizedResponse({ description: 'X-App-Slug 与 query slug 不匹配' })
  @Public()
  async createCollect(
    @Query('slug') slug: string | undefined,
    @Headers('x-app-slug') appSlug: string | undefined,
    @Body() dto: CreateLinkmePayCollectDto,
  ) {
    const app = await this.appGate.findAppByApplicationSlugOrThrow(appSlug);
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Query slug is required');
    this.appGate.assertAppSlug(app, s);
    return this.linkmePay.createSubscriptionCollect(app.id, dto);
  }
}
