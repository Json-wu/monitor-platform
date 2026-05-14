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
  @ApiOperation({ summary: '黑白图上色（DDColor / Replicate）' })
  @ApiHeader({ name: 'X-App-Key', required: true, description: '应用 API Key（Monitor 应用详情 / Application.apiKey）' })
  @ApiHeader({ name: 'X-Api-Key', required: false, description: '终端用户 API Key（第三方 API 调用传入，用于扣除积分）' })
  @ApiHeader({ name: 'X-User-Id', required: false, description: '终端用户唯一标识（站内代理传入，用于扣除积分）' })
  @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string' }, model: { type: 'string', enum: ['large', 'tiny'] } }, required: ['image'] } })
  @ApiOkResponse({ type: V1ColorizeResponseDto, description: '上色完成后的结果图 URL' })
  @UseInterceptors(FileInterceptor('image'))
  async colorize(
    @Req() req: Request,
    @Headers('x-app-key') appKeyHeader: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: false, validators: [new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 })] }))
    file: Express.Multer.File | undefined,
    @Body() body: ColorizeMultipartFieldsDto,
  ): Promise<{ outputUrl: string }> {
    const app = await this.appGate.findAppByApplicationApiKeyOrThrow(appKeyHeader?.trim());
    const image = await this.appGate.resolveColorizeImageString(file, body);
    return this.appGate.withUpscalePublicCredits(
      req,
      app,
      { userId: endUserId, apiKey: endUserApiKey },
      () => this.replicate.colorize({ image, model: body.model }),
    );
  }
}
