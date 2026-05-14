import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RoleService } from './role.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@ApiTags('角色与权限')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('roles')
export class RoleController {
  constructor(private service: RoleService) {}

  @Post()
  @Permissions('roles:create')
  @ApiOperation({ summary: '创建角色' })
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('roles:view')
  @ApiOperation({ summary: '角色列表' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Permissions('roles:view')
  @ApiOperation({ summary: '角色详情' })
  @ApiParam({ name: 'id', description: '角色 UUID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Permissions('roles:edit')
  @ApiOperation({ summary: '更新角色' })
  @ApiParam({ name: 'id', description: '角色 UUID' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('roles:delete')
  @ApiOperation({ summary: '删除角色' })
  @ApiParam({ name: 'id', description: '角色 UUID' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
