import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { V1InpaintingResponseDto } from '../../common/swagger/public-site-api.dto';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { InpaintingMultipartFieldsDto } from './dto/inpainting-multipart.dto';
import { ReplicateService } from './replicate.service';

const INPAINT_MAX_BYTES = 25 * 1024 * 1024;

@ApiTags('公开 · Replicate 图像生成')
@Controller('v1')
export class V1InpaintingController {
  constructor(
    private readonly replicate: ReplicateService,
    private readonly appGate: RemoveBackgroundService,
  ) {}

  @Post('inpainting')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '圈选区域物体移除（LaMa / Replicate Inpainting）' })
  @ApiHeader({ name: 'X-App-Slug', required: true, description: '应用 slug（Monitor 应用详情 / Application.slug）' })
  @ApiHeader({ name: 'X-Api-Key', required: false, description: '终端用户 API Key（用于扣除积分）' })
  @ApiHeader({ name: 'X-User-Id', required: false, description: '终端用户唯一标识（站内代理，用于扣除积分）' })
  @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string' }, mask: { type: 'string' } }, required: ['image', 'mask'] } })
  @ApiOkResponse({ type: V1InpaintingResponseDto, description: '补全后结果图 URL' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]))
  async inpainting(
    @Req() req: Request,
    @Headers('x-app-slug') appSlugHeader: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @UploadedFiles() files: { image?: Express.Multer.File[]; mask?: Express.Multer.File[] } | undefined,
    @Body() body: InpaintingMultipartFieldsDto,
  ): Promise<{ outputUrl: string }> {
    const app = await this.appGate.findAppByApplicationSlugOrThrow(appSlugHeader?.trim());
    const imageFile = files?.image?.[0];
    const maskFile = files?.mask?.[0];
    if (imageFile?.buffer?.length && imageFile.buffer.length > INPAINT_MAX_BYTES) throw new BadRequestException('image file exceeds size limit');
    if (maskFile?.buffer?.length && maskFile.buffer.length > INPAINT_MAX_BYTES) throw new BadRequestException('mask file exceeds size limit');
    const image = await this.appGate.resolvePublicImageFieldString(imageFile, body as Record<string, unknown>, 'image');
    const mask = await this.appGate.resolvePublicImageFieldString(maskFile, body as Record<string, unknown>, 'mask');
    return this.appGate.withUpscalePublicCredits(req, app, { userId: endUserId, apiKey: endUserApiKey }, () =>
      this.replicate.inpaintObjectRemoval({ image, mask }),
    );
  }
}
