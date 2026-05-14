import {
  Body,
  Controller,
  Headers,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  StreamableFile,
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
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { V1ClearbgMultipartFieldsDto } from './dto/v1-clearbg-multipart.dto';
import { RemoveBackgroundService } from './remove-background.service';

/**
 * 公开抠图代理 v1：POST /api/v1/clearbg
 * 必填 Header：`X-App-Key`（值为 Application.apiKey；旧客户端可仍传 `X-App-Id`，效果相同）。
 * 可选：`X-Api-Key`（终端用户 API Key）或 `X-User-Id`（终端用户 UUID，站内代理可用）；否则走匿名日限额。
 */
@ApiTags('抠图 API（公开）')
@Controller('v1')
export class V1ClearbgController {
  constructor(private readonly removeBg: RemoveBackgroundService) {}

  @Post('clearbg')
  @Public()
  @ApiOperation({
    summary: '去除背景（multipart）',
    description:
      '单一表单字段 `image`：可为 multipart 二进制文件，或**文本**（自动识别：以 `http://`/`https://` 开头则按公网 URL 拉取，否则按 base64 / `data:image/...;base64,...` 解码；≤25MB）。必填 `X-App-Key`。可选 `X-Api-Key` 扣积分；否则匿名日限额。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: 'X-App-Key',
    required: true,
    description: '应用 API Key（Monitor 应用详情 / Application.apiKey）',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    required: false,
    description: '终端用户 API Key（第三方API调用传入，用于扣除积分）',
  })
  @ApiHeader({
    name: 'X-User-Id',
    required: false,
    description: '终端用户 UUID（站内代理传入，用于扣除积分）',
  })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({
    description:
      '抠图结果：**二进制图像**（`Content-Type` 由上游决定，常见为 image/png）。**非 JSON**。',
    content: {
      'image/png': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description:
            '唯一字段：① 上传为文件=二进制；② 上传为文本=自动识别 http(s) URL / base64 / data URL',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async clearbg(
    @Req() req: Request,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-app-key') appKeyHeader: string | undefined,
    @Headers('x-api-key') apiKey: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File | undefined,
    @Body() body: V1ClearbgMultipartFieldsDto,
  ): Promise<StreamableFile> {
    const applicationApiKey =appKeyHeader?.trim();
    const app =
      await this.removeBg.findAppByApplicationApiKeyOrThrow(applicationApiKey);
    const image = await this.removeBg.resolveClearbgImagePayload(file, body);
    const { buffer, contentType } = await this.removeBg.proxyClearbgPublic(
      req,
      app,
      image,
      { apiKey: apiKey, userId: endUserId },
    );
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: 'inline; filename="result.png"',
    });
  }
}
