import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { KlingTaskStatusEnvelopeDto } from '../../common/swagger/public-site-api.dto';
import { Public } from '../../common/decorators/public.decorator';
import { KlingImageService } from '../kling-image/kling-image.service';
import { RemoveBackgroundService } from '../remove-background/remove-background.service';
import { RoomDecorationGenerateDto } from './dto/room-decoration-generate.dto';
import {
  dedupeRoomDecorationThemes,
  TuringRoomDecorationService,
} from './turing-room-decoration.service';

/**
 * 房间装修图：`POST /api/v1/room-decoration/generate`
 * 后端按主题依次**创建**可灵单图参考任务，不轮询出图；每主题返回 `taskId`（及 `createResponse`），客户端用
 * `GET /api/v1/room-decoration/tasks/:taskId` 轮询。`model_name` 来自 `roomDecorationModelId` 或「房间装修图默认模型」。
 * 鉴权：`X-App-Key` 必填；`X-Api-Key` / `X-User-Id` 可选（按去重后主题数 1～4 扣分）。
 */
@ApiTags('公开 · 可灵图像生成')
@Controller('v1/room-decoration')
export class V1RoomDecorationController {
  constructor(
    private readonly roomDecoration: TuringRoomDecorationService,
    private readonly appGate: RemoveBackgroundService,
    private readonly kling: KlingImageService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({
    summary: '生成房间装修图（可灵单图参考，按主题创建任务，不阻塞轮询）',
    description:
      '每个主题单独调用可灵 `POST /v1/images/generations`（1 张参考图），**仅创建任务**，返回 `taskId` / `createResponse`；' +
      '请用 `GET /api/v1/room-decoration/tasks/{taskId}` 轮询直至 `data.task_status` 为 succeed/failed。' +
      ' 提示词由房间类型、画质、主题 ID 与用户补充说明拼装（英文）。`themes` 去重保序；' +
      '积分：已识别用户按主题数扣 1～4 分，失败退回；匿名与公开可灵共用日限表。',
  })
  @ApiHeader({
    name: 'X-App-Key',
    required: true,
    description: '应用 API Key（**Application.apiKey**）',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    required: false,
    description: '终端用户 API Key（扣积分）',
  })
  @ApiHeader({
    name: 'X-User-Id',
    required: false,
    description: '终端用户 UUID（站内代理扣积分）',
  })
  @ApiBody({ type: RoomDecorationGenerateDto })
  @ApiOkResponse({
    description:
      '`results` 与请求主题顺序一致；每项含 `theme`、`taskId`、`createResponse`；出图 URL 在轮询 `tasks/:taskId` 成功后的 `data.task_result.images`',
    content: {
      'application/json': {
        examples: {
          syncDone: {
            summary: '同步成功',
            value: [{
              theme: 'modern',
              taskId: 'gen:upstream-task-id',
              imageUrls: ['https://example.com/out.png'],
              task: { code: 0, data: { task_status: 'succeed' } },
            }],
          },
          asyncCreate: {
            summary: '异步仅创建',
            value: [{
              theme: 'modern',
              taskId: 'gen:upstream-task-id',
              createResponse: { code: 0, data: { task_id: 'upstream-task-id' } },
            }],
          },
        },
      },
    },
      schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        results: [
          {
            theme: 'modern',
            taskId: 'gen:…',
            createResponse: { code: 0, data: { task_id: '…' } },
          },
        ],
      },
    },
  })
  async generate(
    @Req() req: Request,
    @Headers('x-app-key') appKeyHeader: string | undefined,
    @Headers('x-user-id') endUserId: string | undefined,
    @Headers('x-api-key') endUserApiKey: string | undefined,
    @Body() dto: RoomDecorationGenerateDto,
  ): Promise<unknown> {
    const app = await this.appGate.findAppByApplicationApiKeyOrThrow(
      appKeyHeader?.trim(),
    );
    const uniqueThemes = dedupeRoomDecorationThemes(dto.themes);
    if (uniqueThemes.length < 1 || uniqueThemes.length > 4) {
      throw new BadRequestException(
        'themes must have 1–4 unique non-empty items after trim',
      );
    }
    const creditAmount = uniqueThemes.length;

    return this.appGate.withRoomDecorationPublicCredits(
      req,
      app,
      { userId: endUserId, apiKey: endUserApiKey },
      creditAmount,
      () => this.roomDecoration.generateViaKling(dto),
    );
  }

  @Get('tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({
    summary: '查询房间装修图单主题可灵任务',
    description:
      '对 `POST /generate` 返回的 `taskId` 轮询任务进度（与公开 `GET .../public/image-generation/tasks/:taskId` 返回体相同）。' +
      ' 鉴权仅需 `X-App-Key`；不另扣积分。',
  })
  @ApiHeader({
    name: 'X-App-Key',
    required: true,
    description: '应用 API Key（**Application.apiKey**）',
  })
  @ApiParam({
    name: 'taskId',
    description:
      '创建接口返回的完整 taskId（含 `gen:` 或 `mi2i:` 前缀）',
  })
  @ApiOkResponse({
    type: KlingTaskStatusEnvelopeDto,
    description: '可灵官方「查询任务」JSON；`data.task_status` 为 succeed 时出图在 `data.task_result.images`',
  })
  async getTaskStatus(
    @Param('taskId') taskId: string | undefined,
    @Headers('x-app-key') appKeyHeader: string | undefined,
  ) {
    await this.appGate.findAppByApplicationApiKeyOrThrow(
      appKeyHeader?.trim(),
    );
    const tid = taskId?.trim();
    if (!tid) throw new BadRequestException('taskId is required');
    return this.kling.getTaskStatus(tid);
  }
}
