import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import { ClientActivityService } from './client-activity.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

function requireAppId(appId?: string): string {
  if (!appId || appId === 'undefined' || appId === 'null') {
    throw new BadRequestException(
      'Query parameter appId is required (valid application UUID).',
    );
  }
  return appId;
}

@ApiTags('客户端行为')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('client-activity-logs')
export class ClientActivityController {
  constructor(private readonly service: ClientActivityService) {}

  @Get()
  @ApiOperation({ summary: '分页查询客户端行为日志（需 appId）' })
  @ApiQuery({ name: 'appId', required: true, description: '应用 UUID' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'visitorId', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期 ISO' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期 ISO' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @Permissions('audit:view')
  findAll(
    @Query('appId') appIdRaw?: string,
    @Query('category') category?: string,
    @Query('action') action?: string,
    @Query('visitorId') visitorId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const appId = requireAppId(appIdRaw);
    return this.service.findAllForApp(
      appId,
      { category, action, visitorId, startDate, endDate },
      page,
      limit,
    );
  }
}
