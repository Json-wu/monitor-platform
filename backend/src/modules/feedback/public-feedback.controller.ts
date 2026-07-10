import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Query,
  Req,
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
import type { Request } from 'express';
import {
  SITE_APP_SLUG_HEADER_DESC,
  SITE_SLUG_QUERY_DESC,
} from '../../common/swagger/public-site-api.dto';
import { Public } from '../../common/decorators/public.decorator';
import { getClientIp } from '../../common/utils/request.util';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { FeedbackService } from './feedback.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

@ApiTags('公开 · 用户反馈')
@Controller('public')
export class PublicFeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly removeBgHelper: RemoveBackgroundService,
  ) {}

  @Post('feedback')
  @ApiOperation({
    summary: '提交用户反馈',
    description:
      'Query `slug` + Header `X-App-Slug` 鉴权。Body：nickname、email、subject、message。',
  })
  @ApiQuery({ name: 'slug', required: true, description: SITE_SLUG_QUERY_DESC })
  @ApiHeader({
    name: 'x-app-slug',
    required: true,
    description: SITE_APP_SLUG_HEADER_DESC,
  })
  @ApiBody({ type: SubmitFeedbackDto })
  @ApiOkResponse({
    description: '提交成功',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean', example: true },
        id: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({ description: '参数缺失或无效' })
  @ApiUnauthorizedResponse({ description: 'X-App-Slug 与 query slug 不匹配' })
  @Public()
  async submit(
    @Query('slug') slug: string | undefined,
    @Headers('x-app-slug') appSlug: string | undefined,
    @Body() body: SubmitFeedbackDto,
    @Req() req: Request,
  ) {
    const app =
      await this.removeBgHelper.findAppByApplicationSlugOrThrow(appSlug);
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Query slug is required');
    this.removeBgHelper.assertAppSlug(app, s);
    return this.feedback.submitByAppSlug(
      s,
      body,
      getClientIp(req),
      req.headers['user-agent'],
    );
  }
}
