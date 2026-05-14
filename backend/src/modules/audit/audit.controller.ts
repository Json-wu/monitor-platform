import {
  BadRequestException,
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

function requireAppId(appId?: string): string {
  if (!appId || appId === 'undefined' || appId === 'null') {
    throw new BadRequestException(
      'Query parameter appId is required (valid application UUID).',
    );
  }
  return appId;
}

@ApiTags('审计日志')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('audit-logs')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get()
  @Permissions('audit:view')
  @ApiOperation({
    summary: '终端用户侧操作审计分页',
    description: '必须传 appId（应用 UUID）',
  })
  @ApiQuery({ name: 'appId', required: true, description: '应用 UUID' })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({
    name: 'endUserId',
    required: false,
    description: '终端用户 UUID',
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO 日期起' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO 日期止' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  findAll(
    @Query('appId') appIdRaw?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('endUserId') endUserId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const appId = requireAppId(appIdRaw);
    return this.service.findAll(
      { appId, module, action, endUserId, startDate, endDate },
      page,
      limit,
    );
  }
}
