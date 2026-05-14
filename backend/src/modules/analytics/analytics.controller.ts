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
  // @ApiExcludeController()
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('数据分析')
@ApiBearerAuth('bearer')
@Controller('analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('overview')
  @Permissions('analytics:view')
  @ApiOperation({ summary: '概览 KPI' })
  @ApiQuery({ name: 'appId', required: false, description: '按应用筛选' })
  getOverview(@Query('appId') appId?: string) {
    return this.service.getOverview(appId);
  }

  @Get('user-growth')
  @Permissions('analytics:view')
  @ApiOperation({ summary: '用户增长' })
  @ApiQuery({ name: 'appId', required: false })
  @ApiQuery({
    name: 'days',
    required: false,
    example: 30,
    description: '最近天数',
  })
  getUserGrowth(
    @Query('appId') appId?: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number,
  ) {
    return this.service.getUserGrowth(appId, days);
  }

  @Get('revenue')
  @Permissions('analytics:view')
  @ApiOperation({ summary: '收入指标' })
  @ApiQuery({ name: 'appId', required: false })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  getRevenueMetrics(
    @Query('appId') appId?: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number,
  ) {
    return this.service.getRevenueMetrics(appId, days);
  }

  @Get('credit-usage')
  @Permissions('analytics:view')
  @ApiOperation({ summary: '积分消耗' })
  @ApiQuery({ name: 'appId', required: false })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  getCreditUsage(
    @Query('appId') appId?: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number,
  ) {
    return this.service.getCreditUsage(appId, days);
  }

  @Get('top-users')
  @Permissions('analytics:view')
  @ApiOperation({ summary: '高消费用户 Top N' })
  @ApiQuery({ name: 'appId', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTopUsers(
    @Query('appId') appId?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.service.getTopUsers(appId, limit);
  }
}
