import {
  Controller,
  Get,
  Post,
  Put,
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
  // @ApiExcludeController()
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminService } from './admin.service';
import {
  CreateAdminDto,
  UpdateAdminDto,
  ResetPasswordDto,
} from './dto/admin.dto';

@ApiTags('管理员账号')
// @// @ApiExcludeController()()
@ApiBearerAuth('bearer')
@Controller('admins')
export class AdminController {
  constructor(private service: AdminService) {}

  @Post()
  @Permissions('admins:create')
  @ApiOperation({ summary: '创建管理员' })
  create(@Body() dto: CreateAdminDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('admins:view')
  @ApiOperation({ summary: '管理员列表' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, description: '邮箱/姓名搜索' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(page, limit, search);
  }

  @Get(':id')
  @Permissions('admins:view')
  @ApiOperation({ summary: '管理员详情' })
  @ApiParam({ name: 'id', description: '管理员 UUID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Permissions('admins:edit')
  @ApiOperation({ summary: '更新管理员' })
  @ApiParam({ name: 'id', description: '管理员 UUID' })
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('admins:delete')
  @ApiOperation({ summary: '删除管理员' })
  @ApiParam({ name: 'id', description: '管理员 UUID' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/reset-password')
  @Permissions('admins:edit')
  @ApiOperation({ summary: '重置管理员密码' })
  @ApiParam({ name: 'id', description: '管理员 UUID' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(id, dto);
  }
}
