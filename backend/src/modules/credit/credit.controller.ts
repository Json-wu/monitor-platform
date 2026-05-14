import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
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
import { CreditService } from './credit.service';
import { GrantCreditsDto, DeductCreditsDto } from './dto/credit.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('积分')
// @ApiExcludeController()
@ApiBearerAuth('bearer')
@Controller('credits')
export class CreditController {
  constructor(private service: CreditService) {}

  @Get('account/:userId/:appId')
  @Permissions('credits:view')
  @ApiOperation({ summary: '查询某用户在某应用下的积分账户' })
  @ApiParam({ name: 'userId', description: '终端用户 UUID' })
  @ApiParam({ name: 'appId', description: '应用 UUID' })
  getAccount(@Param('userId') userId: string, @Param('appId') appId: string) {
    return this.service.getAccount(userId, appId);
  }

  @Post('grant')
  @Permissions('credits:create')
  @ApiOperation({ summary: '手动发放积分' })
  grant(
    @Body() dto: GrantCreditsDto,
    @CurrentUser() user: { id: string; email: string },
    @Req() req: Request,
  ) {
    return this.service.grant(dto, user, req);
  }

  @Post('deduct')
  @Permissions('credits:edit')
  @ApiOperation({ summary: '手动扣减积分' })
  deduct(
    @Body() dto: DeductCreditsDto,
    @CurrentUser() user: { id: string; email: string },
    @Req() req: Request,
  ) {
    return this.service.deduct(dto, user, req);
  }

  @Get('transactions')
  @Permissions('credits:view')
  @ApiOperation({ summary: '积分流水（全站筛选）' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'appId', required: false })
  @ApiQuery({ name: 'type', required: false, description: '流水类型' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  getTransactions(
    @Query('userId') userId?: string,
    @Query('appId') appId?: string,
    @Query('type') type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.getTransactions({ userId, appId, type }, page, limit);
  }
}
