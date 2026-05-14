import {
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
import { SystemOperationLogService } from './system-operation-log.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('系统操作日志')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('system-operation-logs')
export class SystemOperationLogController {
  constructor(private service: SystemOperationLogService) {}

  @Get()
  @ApiOperation({ summary: '分页查询系统操作日志' })
  @ApiQuery({ name: 'appId', required: false, description: '应用 UUID' })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'adminId', required: false, description: '管理员 UUID' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @Permissions('system_logs:view')
  findAll(
    @Query('appId') appId?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAll(
      { appId, module, action, adminId, startDate, endDate },
      page,
      limit,
    );
  }
}
