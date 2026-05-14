import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LinkmePayCollectNotifyDto } from './dto/collect-notify.dto';
import { LinkmePayService } from './linkmepay.service';

@ApiTags('支付 Webhook')
// @ApiExcludeController()
@Controller('payment/webhooks')
export class LinkmePayWebhookController {
  constructor(private readonly linkmePay: LinkmePayService) {}

  /**
   * LinkMePay 异步通知：POST /api/payment/webhooks/linkmepay；
   * notifyPublicBase 须为 Monitor API 根 URL，实际 notify_url = `{notifyPublicBase}/api/payment/webhooks/linkmepay`。
   */
  @Post('linkmepay')
  @ApiOperation({
    summary: 'LinkMePay 代收异步通知（Notify Merchant）',
    description:
      '由 LinkMePay 服务端 POST application/json；支持重试，须幂等并返回 ack。字段定义见 Collect 文档 Notify Merchant 一节。',
    externalDocs: {
      description: 'LinkMePay Collect · Notify Merchant',
      url: 'https://merchant.linkmepay.com/docs/collect.html#notify-merchant',
    },
  })
  @ApiBody({ type: LinkmePayCollectNotifyDto })
  @ApiOkResponse({
    description:
      '成功受理回调；`ack` 为 `"1"` 表示商户已正确处理（渠道文档 Successful Response）',
    schema: {
      type: 'object',
      required: ['ack'],
      properties: {
        ack: { type: 'string', example: '1', description: '固定为 1' },
      },
    },
    content: {
      'application/json': {
        example: { ack: '1' },
      },
    },
  })
  @Public()
  async collectNotify(@Body() body: Record<string, unknown>) {
    return this.linkmePay.handleCollectNotify(body);
  }
}
