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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiExcludeController
} from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreateCouponDto,
  UpdatePricingPagePreviewDto,
} from './dto/pricing.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('定价与优惠券')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('pricing')
export class PricingController {
  constructor(private service: PricingService) {}

  @Post('plans')
  @Permissions('pricing:create')
  @ApiOperation({ summary: '创建定价方案' })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.service.createPlan(dto);
  }

  @Get('plans')
  @Permissions('pricing:view')
  @ApiOperation({ summary: '定价方案列表' })
  @ApiQuery({ name: 'appId', required: false, description: '按应用 UUID 筛选' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  findAllPlans(
    @Query('appId') appId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAllPlans(appId, page, limit);
  }

  @Get('plans/:id')
  @Permissions('pricing:view')
  @ApiOperation({ summary: '单条定价方案' })
  @ApiParam({ name: 'id', description: '方案 UUID' })
  findOnePlan(@Param('id') id: string) {
    return this.service.findOnePlan(id);
  }

  @Put('plans/:id')
  @Permissions('pricing:edit')
  @ApiOperation({ summary: '更新定价方案' })
  @ApiParam({ name: 'id', description: '方案 UUID' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Put('page-preview')
  @Permissions('pricing:edit')
  @ApiOperation({
    summary: '更新定价页文案（pricingPage）',
    description: '合并写入 application.pricing_page，供官网 /pricing 使用',
  })
  @ApiQuery({ name: 'appId', required: true, description: '应用 UUID' })
  updatePagePreview(
    @Query('appId') appId: string,
    @Body() dto: UpdatePricingPagePreviewDto,
  ) {
    if (!appId || appId === 'undefined' || appId === 'null') {
      throw new BadRequestException('appId is required');
    }
    return this.service.updateAppPricingPagePreview(appId, dto);
  }

  @Delete('plans/:id')
  @Permissions('pricing:delete')
  @ApiOperation({ summary: '删除定价方案' })
  @ApiParam({ name: 'id', description: '方案 UUID' })
  deletePlan(@Param('id') id: string) {
    return this.service.deletePlan(id);
  }

  @Post('coupons')
  @Permissions('pricing:create')
  @ApiOperation({ summary: '创建优惠券' })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.service.createCoupon(dto);
  }

  @Get('coupons')
  @Permissions('pricing:view')
  @ApiOperation({ summary: '优惠券列表' })
  @ApiQuery({ name: 'appId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  findAllCoupons(
    @Query('appId') appId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAllCoupons(appId, page, limit);
  }

  @Post('coupons/:id/toggle')
  @Permissions('pricing:edit')
  @ApiOperation({ summary: '启用/停用优惠券' })
  @ApiParam({ name: 'id', description: '优惠券 UUID' })
  toggleCoupon(@Param('id') id: string) {
    return this.service.toggleCoupon(id);
  }
}
