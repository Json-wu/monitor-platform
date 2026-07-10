import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FeedbackStatus } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { FeedbackService } from './feedback.service';
import { UpdateFeedbackStatusDto } from './dto/feedback.dto';

function requireAppId(appId?: string): string {
  if (!appId || appId === 'undefined' || appId === 'null') {
    throw new BadRequestException(
      'Query parameter appId is required (valid application UUID).',
    );
  }
  return appId;
}

@ApiTags('用户反馈')
@ApiBearerAuth('bearer')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Get()
  @ApiOperation({ summary: '分页查询用户反馈（需 appId）' })
  @ApiQuery({ name: 'appId', required: true, description: '应用 UUID' })
  @ApiQuery({ name: 'status', required: false, enum: FeedbackStatus })
  @ApiQuery({ name: 'search', required: false, description: '昵称/邮箱/主题/内容' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @Permissions('feedback:view')
  findAll(
    @Query('appId') appIdRaw?: string,
    @Query('status') status?: FeedbackStatus,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const appId = requireAppId(appIdRaw);
    return this.service.findAllForApp(
      appId,
      { status, search, startDate, endDate },
      page,
      limit,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新反馈处理状态' })
  @ApiQuery({ name: 'appId', required: true })
  @Permissions('feedback:edit')
  updateStatus(
    @Param('id') id: string,
    @Query('appId') appIdRaw: string | undefined,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    const appId = requireAppId(appIdRaw);
    return this.service.updateStatus(appId, id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除反馈' })
  @ApiQuery({ name: 'appId', required: true })
  @Permissions('feedback:delete')
  remove(
    @Param('id') id: string,
    @Query('appId') appIdRaw: string | undefined,
  ) {
    const appId = requireAppId(appIdRaw);
    return this.service.remove(appId, id);
  }
}
