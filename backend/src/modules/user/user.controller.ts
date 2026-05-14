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
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import type { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/request.util';

@ApiTags('终端用户（后台）')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('users')
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  @Permissions('users:create')
  @ApiOperation({ summary: '创建终端用户（运营录入）' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() admin: { id: string; email: string },
    @Req() req: Request,
  ) {
    const audit = {
      actorAdminId: admin.id,
      actorAdminEmail: admin.email,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    };
    return this.service.create(dto, audit);
  }

  @Get()
  @Permissions('users:view')
  @ApiOperation({ summary: '终端用户分页列表' })
  @ApiQuery({
    name: 'appId',
    required: false,
    description: '按应用 UUID 筛选；不传则返回全站用户',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  findAll(
    @Query() query: QueryUserDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.findAll(query, page, limit);
  }

  @Get(':id')
  @Permissions('users:view')
  @ApiOperation({ summary: '终端用户详情' })
  @ApiParam({ name: 'id', description: '用户 UUID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Permissions('users:edit')
  @ApiOperation({ summary: '更新终端用户' })
  @ApiParam({ name: 'id', description: '用户 UUID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() admin: { id: string; email: string },
    @Req() req: Request,
  ) {
    const audit = {
      actorAdminId: admin.id,
      actorAdminEmail: admin.email,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    };
    return this.service.update(id, dto, audit);
  }

  @Delete(':id')
  @Permissions('users:delete')
  @ApiOperation({ summary: '删除终端用户' })
  @ApiParam({ name: 'id', description: '用户 UUID' })
  remove(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string; email: string },
    @Req() req: Request,
  ) {
    const audit = {
      actorAdminId: admin.id,
      actorAdminEmail: admin.email,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    };
    return this.service.remove(id, audit);
  }
}
