import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import { AppRegistryService } from './app-registry.service';
import { CreateAppDto, UpdateAppDto } from './dto/create-app.dto';
import { PatchRemoveBackgroundSettingsDto } from '../remove-background/dto/remove-bg-settings.dto';
import { PatchLinkmePaySettingsDto } from '../linkmepay/dto/linkmepay-settings.dto';
import { PatchGumroadSettingsDto } from '../gumroad/dto/gumroad-settings.dto';
import { PatchSmtpSettingsDto } from './dto/patch-smtp-settings.dto';
import { PatchKlingImageSettingsDto } from '../kling-image/dto/kling-image-settings.dto';
import { PatchReplicateSettingsDto } from '../replicate/dto/patch-replicate-settings.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('应用管理')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('apps')
export class AppRegistryController {
  constructor(private service: AppRegistryService) {}

  @Post()
  @Permissions('apps:create')
  @ApiOperation({ summary: '创建应用' })
  create(@Body() dto: CreateAppDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('apps:view')
  @ApiOperation({ summary: '应用分页列表' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.findAll(page, limit);
  }

  @Get(':id/integrations')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '集成概览（各渠道就绪状态）',
    description:
      '数据来自全站表 global_integration_setting（按 name 分条），与路径中的 appId 无关，仅用于权限校验。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在；用于 RBAC）' })
  getIntegrationsOverview(@Param('id') id: string) {
    return this.service.getIntegrationsOverview(id);
  }

  @Get(':id/integrations/linkme-pay')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '读取 LinkMePay 配置',
    description: '全站共用一套；任意应用 id 返回相同数据。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  getLinkmePaySettings(@Param('id') id: string) {
    return this.service.getLinkmePaySettings(id);
  }

  @Patch(':id/integrations/linkme-pay')
  @Permissions('apps:edit')
  @ApiOperation({
    summary: '更新 LinkMePay 配置',
    description: '写入全站共用表；影响所有应用。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  patchLinkmePaySettings(
    @Param('id') id: string,
    @Body() dto: PatchLinkmePaySettingsDto,
  ) {
    return this.service.patchLinkmePaySettings(id, dto);
  }

  @Get(':id/integrations/gumroad')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '读取 Gumroad 配置',
    description: '全站共用；用于 Ping/Webhook 校验 seller_id。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  getGumroadSettings(@Param('id') id: string) {
    return this.service.getGumroadSettings(id);
  }

  @Patch(':id/integrations/gumroad')
  @Permissions('apps:edit')
  @ApiOperation({
    summary: '更新 Gumroad 配置',
    description: '写入全站 global_integration_setting.name=gumroad。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  patchGumroadSettings(
    @Param('id') id: string,
    @Body() dto: PatchGumroadSettingsDto,
  ) {
    return this.service.patchGumroadSettings(id, dto);
  }

  @Get(':id/integrations/kling-image')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '读取可灵图像生成（开放平台）配置',
    description:
      '全站共用；使用可灵 document-api：AccessKey + SecretKey 生成 JWT，不返回密钥明文。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  getKlingImageSettings(@Param('id') id: string) {
    return this.service.getKlingImageSettings(id);
  }

  @Patch(':id/integrations/kling-image')
  @Permissions('apps:edit')
  @ApiOperation({
    summary: '更新可灵图像生成配置',
    description: '写入全站 global_integration_setting.name=klingImage。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  patchKlingImageSettings(
    @Param('id') id: string,
    @Body() dto: PatchKlingImageSettingsDto,
  ) {
    return this.service.patchKlingImageSettings(id, dto);
  }

  @Get(':id/integrations/replicate')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '读取 Replicate 统一集成配置',
    description: '全站共用；含 colorize / unblur / inpainting / pro-headshot 的模型与默认参数。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  getReplicateSettings(@Param('id') id: string) {
    return this.service.getReplicateSettings(id);
  }

  @Patch(':id/integrations/replicate')
  @Permissions('apps:edit')
  @ApiOperation({
    summary: '更新 Replicate 统一配置',
    description:
      '写入全站 global_integration_setting.name=replicate。Token 传空字符串可清空。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  patchReplicateSettings(
    @Param('id') id: string,
    @Body() dto: PatchReplicateSettingsDto,
  ) {
    return this.service.patchReplicateSettings(id, dto);
  }

  @Get(':id/smtp-settings')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '读取 SMTP 发信配置',
    description: '全站共用一套。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  getSmtpSettings(@Param('id') id: string) {
    return this.service.getSmtpSettings(id);
  }

  @Patch(':id/smtp-settings')
  @Permissions('apps:edit')
  @ApiOperation({
    summary: '更新 SMTP 配置',
    description: '写入全站共用表；影响所有应用发信。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  patchSmtpSettings(
    @Param('id') id: string,
    @Body() dto: PatchSmtpSettingsDto,
  ) {
    return this.service.patchSmtpSettings(id, dto);
  }

  @Get(':id')
  @Permissions('apps:view')
  @ApiOperation({ summary: '应用详情' })
  @ApiParam({ name: 'id', description: '应用 UUID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Permissions('apps:edit')
  @ApiOperation({ summary: '更新应用' })
  @ApiParam({ name: 'id', description: '应用 UUID' })
  update(@Param('id') id: string, @Body() dto: UpdateAppDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('apps:delete')
  @ApiOperation({ summary: '删除应用' })
  @ApiParam({ name: 'id', description: '应用 UUID' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/rotate-key')
  @Permissions('apps:edit')
  @ApiOperation({ summary: '轮换应用 API Key（X-App-Key）' })
  @ApiParam({ name: 'id', description: '应用 UUID' })
  rotateApiKey(@Param('id') id: string) {
    return this.service.rotateApiKey(id);
  }

  @Get(':id/clearbg-settings')
  @Permissions('apps:view')
  @ApiOperation({
    summary: '读取抠图（ClearBG）上游配置',
    description: '上游 URL/凭据为全站共用；与路径中的 appId 无关。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  getClearbgSettings(@Param('id') id: string) {
    return this.service.getClearbgSettings(id);
  }

  @Patch(':id/clearbg-settings')
  @Permissions('apps:edit')
  @ApiOperation({
    summary: '更新抠图（ClearBG）上游配置',
    description: '写入全站共用表；影响所有应用的公开抠图代理。',
  })
  @ApiParam({ name: 'id', description: '应用 UUID（须存在）' })
  patchClearbgSettings(
    @Param('id') id: string,
    @Body() dto: PatchRemoveBackgroundSettingsDto,
  ) {
    return this.service.patchClearbgSettings(id, dto);
  }
}
