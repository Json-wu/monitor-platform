import {
  Controller,
  Get,
  Post,
  Put,
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
import { OrderService } from './order.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  RefundOrderDto,
} from './dto/order.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('订单')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('orders')
export class OrderController {
  constructor(private service: OrderService) {}

  @Post()
  @Permissions('orders:view')
  @ApiOperation({ summary: '创建订单（内部/补单）' })
  create(@Body() dto: CreateOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('orders:view')
  @ApiOperation({ summary: '订单分页列表' })
  @ApiQuery({
    name: 'appId',
    required: false,
    description: '按应用 UUID 筛选；不传则返回全站订单',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  findAll(
    @Query('appId') appId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAll({ appId, userId, status }, page, limit);
  }

  @Get(':id')
  @Permissions('orders:view')
  @ApiOperation({ summary: '订单详情' })
  @ApiParam({ name: 'id', description: '订单 UUID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id/status')
  @Permissions('orders:edit')
  @ApiOperation({ summary: '更新订单状态' })
  @ApiParam({ name: 'id', description: '订单 UUID' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.service.updateStatus(id, dto);
  }

  @Post(':id/refund')
  @Permissions('orders:refund')
  @ApiOperation({ summary: '订单退款' })
  @ApiParam({ name: 'id', description: '订单 UUID' })
  refund(@Param('id') id: string, @Body() dto: RefundOrderDto) {
    return this.service.refund(id, dto);
  }
}
