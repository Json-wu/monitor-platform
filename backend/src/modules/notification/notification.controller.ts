import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { NotificationService } from './notification.service';
import {
  CreateNotificationTemplateDto,
  SendBroadcastDto,
  UpdateNotificationTemplateDto,
} from './dto/notification.dto';

@ApiTags('通知')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('notifications')
export class NotificationController {
  constructor(private service: NotificationService) {}

  @Post('templates')
  @ApiOperation({ summary: '创建通知模板' })
  @Permissions('notifications:create')
  createTemplate(@Body() dto: CreateNotificationTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Put('templates/:id')
  @ApiOperation({ summary: '更新通知模板' })
  @ApiParam({ name: 'id', description: '模板 UUID' })
  @Permissions('notifications:edit')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    return this.service.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: '删除通知模板' })
  @ApiParam({ name: 'id', description: '模板 UUID' })
  @Permissions('notifications:delete')
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  @Get('templates')
  @ApiOperation({ summary: '分页列出通知模板' })
  @ApiQuery({ name: 'appId', required: false, description: '按应用 UUID 筛选' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @Permissions('notifications:view')
  listTemplates(
    @Query('appId') appId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.listTemplates(appId, page, limit);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: '获取单个通知模板' })
  @ApiParam({ name: 'id', description: '模板 UUID' })
  @Permissions('notifications:view')
  findTemplate(@Param('id') id: string) {
    return this.service.findTemplate(id);
  }

  @Post('broadcast')
  @ApiOperation({ summary: '广播通知' })
  @Permissions('notifications:create')
  sendBroadcast(@Body() dto: SendBroadcastDto) {
    return this.service.sendBroadcast(dto);
  }

  @Get('logs')
  @ApiOperation({ summary: '分页查询通知发送日志' })
  @ApiQuery({ name: 'appId', required: false, description: '应用 UUID' })
  @ApiQuery({ name: 'channel', required: false, description: '渠道' })
  @ApiQuery({ name: 'status', required: false, description: '状态' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @Permissions('notifications:view')
  listLogs(
    @Query('appId') appId?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.listLogs({ appId, channel, status }, page, limit);
  }
}
