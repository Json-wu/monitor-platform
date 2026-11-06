import {
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
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OpsService } from './ops.service';

@ApiTags('运维监控')
@ApiBearerAuth('bearer')
@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('overview')
  @ApiOperation({ summary: '进程自检 + 定时任务实时概览' })
  @Permissions('ops:view')
  overview() {
    return this.ops.overview();
  }

  @Get('job-runs')
  @ApiOperation({ summary: '定时任务执行历史' })
  @ApiQuery({ name: 'jobName', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @Permissions('ops:view')
  jobRuns(
    @Query('jobName') jobName?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.ops.findJobRuns({ jobName, status }, page, limit);
  }
}
