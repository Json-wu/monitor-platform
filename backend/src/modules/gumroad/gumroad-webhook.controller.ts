import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithRawBody } from '../../common/utils/raw-body.util';
import { getClientIp } from '../../common/utils/request.util';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { GumroadService } from './gumroad.service';

/**
 * Gumroad「Ping」通知接收端：
 *
 * - 在 Gumroad → Settings → Advanced → Ping endpoint 填入：
 *   `${notifyPublicBase}/api/payment/webhooks/gumroad`
 * - Content-Type：`application/x-www-form-urlencoded`（须返回 HTTP 200，否则 Gumroad 会重试）
 * @see https://gumroad.com/ping
 * - 校验 `seller_id` 后，用 `product_permalink` 等在 `payment_link` 匹配方案；
 *   用户优先 `url_params.user_id`（营销站购买链接已追加），否则按 `email` 匹配。
 */
@ApiTags('支付 Webhook')
@Controller('payment/webhooks')
export class GumroadWebhookController {
  constructor(private readonly gumroad: GumroadService) {}

  @Post('gumroad')
  @Public()
  @ApiOperation({
    summary: 'Gumroad Ping（产品销售/退款通知）',
    description:
      '请求体由 Gumroad 发送，application/x-www-form-urlencoded。校验 seller_id 后按邮箱与方案 payment_link 自动发放积分；幂等以 sale_id 作为订单编号。' +
      ' industry-ai-news-pro / unlimited 会原样中继至 Supabase gumroad-webhook，并在应用 chrome-ainews 下按邮箱建用户与订单。',
  })
  @ApiOkResponse({
    description: '成功受理',
    schema: { type: 'object', properties: { ack: { type: 'string', example: 'ok' } } },
  })
  @ApiUnauthorizedResponse({ description: 'seller_id 不匹配' })
  async ping(
    @Body() body: Record<string, unknown>,
    @Req() req: Request & RequestWithRawBody,
  ) {
    const contentType = req.headers['content-type'];
    return this.gumroad.handlePing(body, {
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      rawBody: req.rawBody,
      contentType: typeof contentType === 'string' ? contentType : undefined,
    });
  }
}
