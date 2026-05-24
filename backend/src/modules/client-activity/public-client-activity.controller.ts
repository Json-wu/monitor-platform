import {
  Body,
  Controller,
  Headers,
  Post,
  Query,
  Req,
  BadRequestException,
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
  PublicClientActivityIngestResponseDto,
  SITE_APP_SLUG_HEADER_DESC,
  SITE_SLUG_QUERY_DESC,
} from '../../common/swagger/public-site-api.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { ClientActivityService } from './client-activity.service';
import { IngestClientActivityDto } from './dto/ingest-client-activity.dto';

@ApiTags('公开 · 客户端行为')
@Controller('public')
export class PublicClientActivityController {
  constructor(
    private readonly clientActivity: ClientActivityService,
    private readonly removeBgHelper: RemoveBackgroundService,
  ) {}

  @Post('client-activity')
  @ApiOperation({
    summary: '上报客户端行为事件',
    description: 'Query `slug` + Header `X-App-Slug` 鉴权，body 为事件批次。',
  })
  @ApiQuery({ name: 'slug', required: true, description: SITE_SLUG_QUERY_DESC })
  @ApiHeader({
    name: 'x-app-slug',
    required: true,
    description: SITE_APP_SLUG_HEADER_DESC,
  })
  @ApiBody({ type: IngestClientActivityDto })
  @ApiOkResponse({
    type: PublicClientActivityIngestResponseDto,
    description: '写入成功条数',
  })
  @ApiBadRequestResponse({
    description: 'slug 缺失、events 为空等',
  })
  @ApiUnauthorizedResponse({ description: 'X-App-Slug 与 query slug 不匹配' })
  @Public()
  async ingest(
    @Query('slug') slug: string | undefined,
    @Headers('x-app-slug') appSlug: string | undefined,
    @Body() body: IngestClientActivityDto,
    @Req() req: Request,
  ) {
    const app = await this.removeBgHelper.findAppByApplicationSlugOrThrow(appSlug);
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Query slug is required');
    this.removeBgHelper.assertAppSlug(app, s);
    if (!body?.events?.length) {
      throw new BadRequestException('events array is required');
    }
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      '0.0.0.0';
    const ua = req.headers['user-agent'];
    return this.clientActivity.ingestByAppSlug(s, body, ip, ua);
  }
}
