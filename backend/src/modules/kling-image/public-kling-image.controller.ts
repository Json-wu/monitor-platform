import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  KlingGenerateSyncResponseDto,
  KlingTaskStatusEnvelopeDto,
  SITE_SLUG_QUERY_DESC,
  TuringCompatSyncResponseDto,
} from '../../common/swagger/public-site-api.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { KlingImageGenerateDto } from './dto/kling-generate.dto';
import { TuringImageCompatDto } from './dto/turing-image-compat.dto';
import { KlingImageService } from './kling-image.service';

@ApiTags('公开 · 可灵图像生成')
@Controller('public/image-generation')
export class PublicKlingImageController {
  constructor(
    private readonly kling: KlingImageService,
    private readonly appGate: RemoveBackgroundService,
  ) {}

  @Post('generate')
  @Public()
  @ApiOperation({
    summary: '文生图 / 参考图生图（简化 JSON）',
    description:
      '必填 `X-App-Key`（Monitor 应用 API Key）。可选 `X-Api-Key` / `X-User-Id` 识别终端用户并扣 1 积分；未识别时同一 IP 每 UTC 日共 1 次免费。',
  })
  @ApiHeader({
    name: 'X-App-Key',
    required: true,
    description: '应用 API Key（Application.apiKey）',
  })
  @ApiHeader({
    name: 'X-User-Id',
    required: false,
    description: '终端用户唯一标识（应用内调用时传入，用于扣除积分）',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    required: false,
    description: '终端用户 API Key（第三方API调用传入，用于扣除积分）',
  })
  @ApiBody({ type: KlingImageGenerateDto })
  @ApiOkResponse({
    type: KlingGenerateSyncResponseDto,
    description:
      '**sync=true（默认）**：轮询完成后返回 `taskId` + `imageUrls` + `task`（官方查询封装）。**sync=false**：仅创建，返回 `taskId` + `createResponse`，须再调 GET `tasks/:taskId`（带 slug + X-App-Key）。`taskId` 含 `gen:`（单图）或 `mi2i:`（多图）前缀。',
    content: {
      'application/json': {
        examples: {
          syncDone: {
            summary: '同步成功',
            value: {
              taskId: 'gen:upstream-task-id',
              imageUrls: ['https://example.com/out.png'],
              task: { code: 0, data: { task_status: 'succeed' } },
            },
          },
          asyncCreate: {
            summary: '异步仅创建',
            value: {
              taskId: 'gen:upstream-task-id',
              createResponse: { code: 0, data: { task_id: 'upstream-task-id' } },
            },
          },
        },
      },
    },
  })
  async generate(
    @Req() req: Request,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-app-key') appKey: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @Body() dto: KlingImageGenerateDto,
  ) {
    const applicationApiKey =appKey?.trim();
    const app = await this.appGate.findAppByApplicationApiKeyOrThrow(
      applicationApiKey,
    );
    return this.appGate.withKlingImagePublicCredits(
      req,
      app,
      { userId: endUserId, apiKey: endUserApiKey },
      () => this.kling.generateFromDto(dto),
    );
  }

  @Post('turing')
  @Public()
  @ApiOperation({
    summary: '图灵 OpenAPI v2 风格兼容壳',
    description:
      '将 `perception.inputText` + `perception.inputImage` 映射为可灵官方任务；参考图 0–1 张走单图接口，≥2 张走多图接口。成功时 `results[].resultType=image`。鉴权与积分规则同 generate。',
  })
  @ApiQuery({ name: 'slug', required: true, description: SITE_SLUG_QUERY_DESC })
  @ApiHeader({
    name: 'X-App-Key',
    required: true,
    description: '应用 API Key（**Application.apiKey**），须与 slug 对应应用一致',
  })
  @ApiHeader({
    name: 'X-User-Id',
    required: false,
    description: '终端用户唯一标识（应用内调用时传入，用于扣除积分）',
  })
  @ApiBody({ type: TuringImageCompatDto })
  @ApiOkResponse({
    type: TuringCompatSyncResponseDto,
    description:
      '**sync=true**：`intent.code=0`，`results` 中 `resultType=image` 与出图 URL。**sync=false**：`results` 另含 `text`（轮询说明）与 `url`（`task://taskId`）项。',
    content: {
      'application/json': {
        examples: {
          syncImages: {
            summary: '同步出图',
            value: {
              intent: { code: 0 },
              results: [
                {
                  groupType: 1,
                  resultType: 'image',
                  values: { url: 'https://example.com/out.png' },
                },
              ],
            },
          },
          asyncAck: {
            summary: '异步创建',
            value: {
              intent: { code: 0 },
              results: [
                {
                  groupType: 1,
                  resultType: 'text',
                  values: {
                    text: '任务已创建，请使用 GET …/tasks/gen:xxx 轮询',
                  },
                },
                {
                  groupType: 1,
                  resultType: 'url',
                  values: { url: 'task://gen:xxx' },
                },
              ],
            },
          },
        },
      },
    },
  })
  async turingCompat(
    @Req() req: Request,
    @Query('slug') slug: string | undefined,
    @Headers('x-app-key') apiKey: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Body() dto: TuringImageCompatDto,
  ) {
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Query slug is required');
    const app = await this.appGate.findAppBySlugOrThrow(s);
    this.appGate.assertAppKey(app, apiKey);
    return this.appGate.withKlingImagePublicCredits(
      req,
      app,
      { userId: endUserId },
      () => this.kling.generateFromTuringCompat(dto),
    );
  }

  @Get('tasks/:taskId')
  @Public()
  @ApiOperation({
    summary: '查询可灵官方图像任务',
    description:
      '异步模式（sync=false）后轮询；taskId 须为创建接口返回的完整值（含 `gen:` 或 `mi2i:` 前缀）。鉴权同 generate。',
  })
  @ApiQuery({ name: 'slug', required: true, description: SITE_SLUG_QUERY_DESC })
  @ApiHeader({
    name: 'X-App-Key',
    required: true,
    description: '应用 API Key（**Application.apiKey**），须与 slug 对应应用一致',
  })
  @ApiParam({
    name: 'taskId',
    description:
      '创建接口返回的完整 taskId（含 `gen:` 或 `mi2i:` 前缀），与官方查询路径一致',
  })
  @ApiOkResponse({
    type: KlingTaskStatusEnvelopeDto,
    description: '可灵官方「查询任务」JSON；`data.task_status` 等字段以可灵文档为准',
    content: {
      'application/json': {
        example: {
          code: 0,
          message: 'success',
          data: { task_status: 'succeed', task_id: '…' },
        },
      },
    },
  })
  async getTask(
    @Param('taskId') taskId: string | undefined,
    @Query('slug') slug: string | undefined,
    @Headers('x-app-key') apiKey: string | undefined,
  ) {
    const tid = taskId?.trim();
    if (!tid) throw new BadRequestException('taskId is required');
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Query slug is required');
    const app = await this.appGate.findAppBySlugOrThrow(s);
    this.appGate.assertAppKey(app, apiKey);
    return this.kling.getTaskStatus(tid);
  }
}
