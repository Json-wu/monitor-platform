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
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { V1UnblurResponseDto } from '../../common/swagger/public-site-api.dto';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { ReplicateService } from './replicate.service';
import { OnblurMultipartFieldsDto } from './dto/onblur-multipart.dto';

@ApiTags('公开 · Replicate 图像生成')
@Controller('v1')
export class V1OnblurController {
  constructor(
    private readonly replicate: ReplicateService,
    private readonly appGate: RemoveBackgroundService,
  ) {}

  @Post('unblur')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '模糊图片转高清（自动路由超分模型）' })
  @ApiHeader({ name: 'X-App-Slug', required: true, description: '应用 slug（Monitor 应用详情 / Application.slug）' })
  @ApiHeader({ name: 'X-Api-Key', required: false, description: '终端用户 API Key（第三方 API 调用传入，用于扣除积分）' })
  @ApiHeader({ name: 'X-User-Id', required: false, description: '终端用户唯一标识（站内代理传入，用于扣除积分）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        type: { type: 'string', enum: ['auto', 'face', 'general', 'anime'], default: 'auto' },
        scale: { type: 'integer', enum: [2, 4], default: 4 },
        strength: { type: 'string', enum: ['standard', 'strong'], default: 'standard' },
      },
      required: ['image'],
    },
  })
  @ApiOkResponse({ type: V1UnblurResponseDto, description: '超分结果 URL 与实际路由类型（face / general / anime）' })
  @UseInterceptors(FileInterceptor('image'))
  async unblur(
    @Req() req: Request,
    @Headers('x-app-slug') appSlugHeader: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: false, validators: [new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 })] }))
    file: Express.Multer.File | undefined,
    @Body() body: OnblurMultipartFieldsDto,
  ): Promise<{ outputUrl: string; routedType: string }> {
    const app = await this.appGate.findAppByApplicationSlugOrThrow(appSlugHeader?.trim());
    const image = await this.appGate.resolveColorizeImageString(file, body);
    const creditAmount = body.strength === 'strong' ? 3 : 1;
    return this.appGate.withUpscalePublicCredits(
      req,
      app,
      { userId: endUserId, apiKey: endUserApiKey },
      () => this.replicate.upscale({ image, type: body.type, scale: body.scale, strength: body.strength }),
      creditAmount,
    );
  }
}
