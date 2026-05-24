import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { V1ProHeadshotResponseDto } from '../../common/swagger/public-site-api.dto';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import {
  type ProHeadshotBackground,
  ProHeadshotMultipartFieldsDto,
  type ProHeadshotOutfit,
  type ProHeadshotSize,
  type ProHeadshotUseCase,
} from './dto/pro-headshot-multipart.dto';
import { ReplicateService } from './replicate.service';

@ApiTags('公开 · Replicate 图像生成')
@Controller('v1')
export class V1ProHeadshotController {
  constructor(
    private readonly replicate: ReplicateService,
    private readonly appGate: RemoveBackgroundService,
  ) {}

  @Post('pro-headshot')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '生成专业证件照（Replicate）' })
  @ApiHeader({ name: 'X-App-Slug', required: true, description: '应用 slug（Monitor 应用详情 / Application.slug）' })
  @ApiHeader({ name: 'X-Api-Key', required: false, description: '终端用户 API Key（用于扣除积分）' })
  @ApiHeader({ name: 'X-User-Id', required: false, description: '终端用户唯一标识（站内代理，用于扣除积分）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        size: { type: 'string', enum: ['1:1', '4:5', '2:3'], default: '4:5' },
        background: { type: 'string', enum: ['white', 'black', 'neutral', 'gray', 'office'], default: 'neutral' },
        outfit: { type: 'string', enum: ['business-formal', 'business-casual', 'blazer', 'shirt'], default: 'business-formal' },
        useCase: { type: 'string', enum: ['linkedin', 'resume', 'company-profile', 'id-photo'], default: 'linkedin' },
        outputs: { type: 'string', enum: ['1', '2', '4'], default: '1' },
        safety_tolerance: {
          type: 'integer',
          minimum: 0,
          maximum: 2,
          default: 2,
          description: 'Safety tolerance，0 最严格，2 最宽松（当前最大值 2）',
        },
      },
      required: ['image'],
    },
  })
  @ApiOkResponse({ type: V1ProHeadshotResponseDto, description: '专业证件照结果图 URL 列表' })
  @UseInterceptors(FileInterceptor('image'))
  async proHeadshot(
    @Req() req: Request,
    @Headers('x-app-slug') appSlugHeader: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: false, validators: [new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 })] }))
    file: Express.Multer.File | undefined,
    @Body() body: ProHeadshotMultipartFieldsDto,
  ): Promise<{ outputUrls: string[] }> {
    const app = await this.appGate.findAppByApplicationSlugOrThrow(appSlugHeader?.trim());
    const image = await this.appGate.resolveColorizeImageString(file, body);
    const outputs = Number(body.outputs ?? '1');
    const creditAmount = outputs === 2 || outputs === 4 ? outputs : 1;
    return this.appGate.withUpscalePublicCredits(
      req,
      app,
      { userId: endUserId, apiKey: endUserApiKey },
      () =>
        this.replicate.proHeadshot({
          image,
          size: (body.size ?? '4:5') as ProHeadshotSize,
          background: (body.background ?? 'neutral') as ProHeadshotBackground,
          outfit: (body.outfit ?? 'business-formal') as ProHeadshotOutfit,
          useCase: (body.useCase ?? 'linkedin') as ProHeadshotUseCase,
          outputs: creditAmount as 1 | 2 | 4,
          safetyTolerance: Math.max(0, Math.min(2, body.safety_tolerance ?? 2)) as 0 | 1 | 2,
        }),
      creditAmount,
    );
  }
}
