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
import { V1ColorizeResponseDto } from '../../common/swagger/public-site-api.dto';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { ColorizeMultipartFieldsDto } from './dto/colorize-multipart.dto';
import { ReplicateService } from './replicate.service';

@ApiTags('公开 · Replicate 图像生成')
@Controller('v1')
export class V1ColorizeController {
  constructor(
    private readonly replicate: ReplicateService,
    private readonly appGate: RemoveBackgroundService,
  ) {}

  @Post('colorize')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '黑白图上色（DDColor / Replicate）',
    description:
      '必填 `X-App-Slug`。基础上色扣 1 积分；`clean_scratches=true` 上色成功后划痕修复再扣 1 分；`face_remaster=true` 再扣 2 分做人脸/模糊转高清。匿名仅免费基础上色（无附加项）。',
  })
  @ApiHeader({
    name: 'X-App-Slug',
    required: true,
    description: '应用 slug（Application.slug）',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    required: false,
    description: '终端用户 API Key（第三方 API 调用传入，用于扣除积分）',
  })
  @ApiHeader({
    name: 'X-User-Id',
    required: false,
    description: '终端用户唯一标识（站内代理传入，用于扣除积分）',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        model: { type: 'string', enum: ['large', 'tiny'] },
        clean_scratches: { type: 'boolean', default: false },
        face_remaster: { type: 'boolean', default: false },
      },
      required: ['image'],
    },
  })
  @ApiOkResponse({
    type: V1ColorizeResponseDto,
    description: '流水线最终输出图 URL',
  })
  @UseInterceptors(FileInterceptor('image'))
  async colorize(
    @Req() req: Request,
    @Headers('x-app-slug') appSlugHeader: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File | undefined,
    @Body() body: ColorizeMultipartFieldsDto,
  ): Promise<{ outputUrl: string }> {
    const app = await this.appGate.findAppByApplicationSlugOrThrow(
      appSlugHeader?.trim() ?? 'colorizerai',
    );
    const image = await this.appGate.resolveColorizeImageString(file, body);
    const cleanScratches = body.clean_scratches === true;
    const faceRemaster = body.face_remaster === true;

    return this.appGate.withColorizePipelinePublicCredits(
      req,
      app,
      { userId: endUserId, apiKey: endUserApiKey },
      { cleanScratches, faceRemaster },
      {
        colorize: () =>
          this.replicate.colorize({ image, model: body.model }),
        scratchRepair: (imageUrl) =>
          this.replicate.cleanScratches({ image: imageUrl }),
        faceRemaster: (imageUrl) =>
          this.replicate
            .upscale({
              image: imageUrl,
              type: 'face',
              strength: 'standard',
              scale: 2,
            })
            .then((r) => ({ outputUrl: r.outputUrl })),
      },
    );
  }
}
