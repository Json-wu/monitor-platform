import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { GLOBAL_INTEGRATION_KLING_IMAGE } from '../global-integration/global-integration.constants';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';
import { signKlingOfficialJwt } from './kling-official-jwt.util';
import type { PatchKlingImageSettingsDto } from './dto/kling-image-settings.dto';
import type { KlingImageGenerateDto } from './dto/kling-generate.dto';
import type { TuringImageCompatDto } from './dto/turing-image-compat.dto';

/** 可灵开放平台 HTTP 根（与 kling-api SDK 默认一致，可在后台覆盖） */
const DEFAULT_KLING_HTTP_BASE = 'https://api-singapore.klingai.com';
/** 0–1 张参考图：官方「图像生成」 */
const PATH_IMAGE_GENERATIONS = '/v1/images/generations';
const PATH_QUERY_GENERATIONS = (taskId: string) =>
  `/v1/images/generations/${encodeURIComponent(taskId)}`;
/** 2–4 张参考图：官方「多图生图」 */
const PATH_MULTI_IMAGE2IMAGE = '/v1/images/multi-image2image';
const PATH_QUERY_MULTI = (taskId: string) =>
  `/v1/images/multi-image2image/${encodeURIComponent(taskId)}`;

/** 可灵参考图边长约束（过短/过长易报 Image pixel is invalid）；与官方文档量级一致时可再调 */
const KLING_REF_IMG_MIN_SHORT_SIDE = 300;
const KLING_REF_IMG_MAX_LONG_SIDE = 4096;

function snapDimensionToMultipleOf8(n: number): number {
  const v = Math.round(n / 8) * 8;
  return Math.max(8, v);
}

/** 客户端未传 `model` 时，与后台未配置 defaultModelSingle 时的代码兜底 */
const DEFAULT_MODEL_SINGLE = 'kling-v1';
const DEFAULT_MODEL_MULTI = 'kling-v2';
/** 与 KlingImageGenerateDto 文档默认值一致 */
const DEFAULT_GENERATE_N = 1;
const DEFAULT_ASPECT_RATIO = '1:1';
const DEFAULT_RESOLUTION = '1k';
const MAX_MULTI_SUBJECTS = 4;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 115_000;
/** 可灵官方 HTTP 单次请求（POST 创建 / GET 查任务）在服务端代理时的最大等待时间 */
const KLING_UPSTREAM_TIMEOUT_MS = 50_000;

export type KlingPublicTaskMode = 'gen' | 'mi2i';

function encodePublicTaskId(
  mode: KlingPublicTaskMode,
  upstreamTaskId: string,
): string {
  return `${mode}:${upstreamTaskId}`;
}

function decodePublicTaskId(raw: string): {
  mode: KlingPublicTaskMode;
  taskId: string;
} {
  const i = raw.indexOf(':');
  if (i <= 0 || i === raw.length - 1) {
    return { mode: 'gen', taskId: raw.trim() };
  }
  const prefix = raw.slice(0, i);
  const rest = raw.slice(i + 1).trim();
  if (prefix === 'mi2i') return { mode: 'mi2i', taskId: rest };
  if (prefix === 'gen') return { mode: 'gen', taskId: rest };
  return { mode: 'gen', taskId: raw.trim() };
}

@Injectable()
export class KlingImageService {
  private readonly logger = new Logger(KlingImageService.name);

  private tokenCache:
    | {
        accessKey: string;
        secretKey: string;
        bearer: string;
        refreshAfterMs: number;
      }
    | undefined;

  constructor(
    private readonly globalIntegration: GlobalIntegrationSettingsService,
  ) {}

  private async getConfigRow(): Promise<Record<string, unknown>> {
    return this.globalIntegration.getConfig(GLOBAL_INTEGRATION_KLING_IMAGE);
  }

  async patchAdminSettings(dto: PatchKlingImageSettingsDto) {
    await this.globalIntegration.mergeConfig(
      GLOBAL_INTEGRATION_KLING_IMAGE,
      (raw) => {
        const next = { ...raw };
        if (dto.enabled !== undefined) next.enabled = dto.enabled;
        if (dto.baseUrl !== undefined) next.baseUrl = dto.baseUrl.trim();
        if (dto.defaultModelSingle !== undefined) {
          next.defaultModelSingle =
            dto.defaultModelSingle.trim() === ''
              ? ''
              : dto.defaultModelSingle.trim();
        }
        if (dto.defaultModelMulti !== undefined) {
          next.defaultModelMulti =
            dto.defaultModelMulti.trim() === ''
              ? ''
              : dto.defaultModelMulti.trim();
        }
        if (dto.defaultRoomDecorationModel !== undefined) {
          next.defaultRoomDecorationModel =
            dto.defaultRoomDecorationModel.trim() === ''
              ? ''
              : dto.defaultRoomDecorationModel.trim();
        }
        if (dto.accessKey !== undefined) {
          next.accessKey =
            dto.accessKey.trim() === '' ? '' : dto.accessKey.trim();
        }
        if (dto.secretKey !== undefined) {
          next.secretKey =
            dto.secretKey.trim() === '' ? '' : dto.secretKey.trim();
        }
        if (dto.dashscopeApiKey !== undefined) {
          next.dashscopeApiKey =
            dto.dashscopeApiKey.trim() === '' ? '' : dto.dashscopeApiKey.trim();
        }
        return next;
      },
    );
    this.tokenCache = undefined;
  }

  async getSettingsForAdmin(): Promise<{
    enabled: boolean;
    apiKeySet: boolean;
    accessKeySet: boolean;
    secretKeySet: boolean;
    defaultModelSingle: string;
    defaultModelMulti: string;
    defaultRoomDecorationModel: string;
    baseUrl: string;
  }> {
    const c = await this.getConfigRow();
    const accessKey = typeof c.accessKey === 'string' ? c.accessKey.trim() : '';
    const secretKey = typeof c.secretKey === 'string' ? c.secretKey.trim() : '';
    const base =
      typeof c.baseUrl === 'string' && c.baseUrl.trim()
        ? c.baseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_KLING_HTTP_BASE;
    const single =
      typeof c.defaultModelSingle === 'string' && c.defaultModelSingle.trim()
        ? c.defaultModelSingle.trim()
        : typeof c.defaultModel === 'string' &&
            c.defaultModel.trim() &&
            !String(c.defaultModel).includes('/')
          ? String(c.defaultModel).trim()
          : DEFAULT_MODEL_SINGLE;
    const multi =
      typeof c.defaultModelMulti === 'string' && c.defaultModelMulti.trim()
        ? c.defaultModelMulti.trim()
        : DEFAULT_MODEL_MULTI;
    const roomDeco =
      typeof c.defaultRoomDecorationModel === 'string' &&
      c.defaultRoomDecorationModel.trim()
        ? c.defaultRoomDecorationModel.trim()
        : '';
    const credOk = accessKey.length > 0 && secretKey.length > 0;
    return {
      enabled: c.enabled === true,
      apiKeySet: credOk,
      accessKeySet: accessKey.length > 0,
      secretKeySet: secretKey.length > 0,
      defaultModelSingle: single,
      defaultModelMulti: multi,
      defaultRoomDecorationModel: roomDeco,
      baseUrl: base,
    };
  }

  /**
   * 装修图：显式 model 优先，否则配置项 defaultRoomDecorationModel，否则与单图默认相同。
   */
  async resolveModelForRoomDecoration(modelOverride?: string): Promise<string> {
    const o = modelOverride?.trim();
    if (o) return o;
    const c = await this.getConfigRow();
    const deco =
      typeof c.defaultRoomDecorationModel === 'string' &&
      c.defaultRoomDecorationModel.trim()
        ? c.defaultRoomDecorationModel.trim()
        : '';
    if (deco) return deco;
    const {
      defaultModelSingle,
    } = await this.assertActiveConfig();
    return defaultModelSingle;
  }

  /** 创建任务 + 可选轮询；按参考图数量自动选官方单图或多图接口 */
  async generateFromDto(dto: KlingImageGenerateDto) {
    const rawInputs = this.collectImageInputsFromDto(dto);
    const imagePayloads = await Promise.all(
      rawInputs.map((s) => this.resolveKlingImageInputForApi(s)),
    );
    if (imagePayloads.length > MAX_MULTI_SUBJECTS) {
      throw new BadRequestException(`参考图最多 ${MAX_MULTI_SUBJECTS} 张`);
    }
    const {
      accessKey,
      secretKey,
      baseUrl,
      defaultModelSingle,
      defaultModelMulti,
    } = await this.assertActiveConfig();
    const modelOverride = dto.model?.trim();
    const n =
      dto.n != null && Number.isFinite(dto.n)
        ? Math.min(9, Math.max(1, Math.trunc(dto.n)))
        : DEFAULT_GENERATE_N;
    const aspect_ratio =
      dto.aspect_ratio?.trim() || DEFAULT_ASPECT_RATIO;
    const resolution = dto.resolution?.trim() || DEFAULT_RESOLUTION;
    const negative = dto.negative_prompt?.trim();
    const sync = dto.sync !== false;

    if (imagePayloads.length >= 2) {
      const model_name = modelOverride || defaultModelMulti;
      const body: Record<string, unknown> = {
        model_name,
        subject_image_list: imagePayloads.map((payload) => ({
          subject_image: payload,
        })),
        prompt: dto.prompt,
        n,
        aspect_ratio,
        resolution,
      };
      if (negative) body.negative_prompt = negative;
      return this.runOfficialTask({
        mode: 'mi2i',
        accessKey,
        secretKey,
        baseUrl,
        createPath: PATH_MULTI_IMAGE2IMAGE,
        queryPath: PATH_QUERY_MULTI,
        body,
        sync,
      });
    }
    const model_name = modelOverride || defaultModelSingle;
    const body: Record<string, unknown> = {
      model_name,
      prompt: dto.prompt,
      n,
      aspect_ratio,
      resolution,
    };
    if (imagePayloads.length === 1) {
      body.image = imagePayloads[0];
    }
    if (negative) body.negative_prompt = negative;
    return this.runOfficialTask({
      mode: 'gen',
      accessKey,
      secretKey,
      baseUrl,
      createPath: PATH_IMAGE_GENERATIONS,
      queryPath: PATH_QUERY_GENERATIONS,
      body,
      sync,
    });
  }

  /** 图灵风格 perception → 按参考图条数路由官方单图 / 多图接口 */
  async generateFromTuringCompat(dto: TuringImageCompatDto) {
    const { prompt, urls } = this.parseTuringPerception(dto.perception);
    if (!prompt) {
      throw new BadRequestException('perception.inputText.text 为必填');
    }
    const kp = dto.klingParameters;
    const negRaw = this.readStrParam(kp, 'negative_prompt');
    const gen: KlingImageGenerateDto = {
      prompt,
      images: urls.length ? urls : undefined,
      model: this.readStrParam(kp, 'model'),
      n: this.readIntParam(kp, 'n'),
      aspect_ratio: this.readStrParam(kp, 'aspect_ratio'),
      resolution: this.readStrParam(kp, 'resolution'),
      negative_prompt: negRaw?.trim() ? negRaw.trim() : undefined,
      sync: dto.sync !== false,
    };
    const raw = await this.generateFromDto(gen);
    if (
      dto.sync === false &&
      'taskId' in raw &&
      typeof raw.taskId === 'string'
    ) {
      return this.turingAsyncAck(raw.taskId);
    }
    const urlsOut = (raw as { imageUrls?: string[] }).imageUrls ?? [];
    return this.turingSuccess(urlsOut);
  }

  async getTaskStatus(taskIdParam: string) {
    const { accessKey, secretKey, baseUrl } = await this.assertActiveConfig();
    const { mode, taskId } = decodePublicTaskId(taskIdParam);
    const path =
      mode === 'mi2i'
        ? PATH_QUERY_MULTI(taskId)
        : PATH_QUERY_GENERATIONS(taskId);
    return this.klingGet(accessKey, secretKey, baseUrl, path);
  }

  private turingAsyncAck(taskId: string) {
    return {
      intent: { code: 0 },
      results: [
        {
          groupType: 1,
          resultType: 'text',
          values: {
            text: `任务已创建，请使用 GET /api/public/image-generation/tasks/${encodeURIComponent(taskId)} 轮询（Query slug + Header X-App-Key）。taskId 含 gen:/mi2i: 前缀以区分官方查询路径。`,
          },
        },
        {
          groupType: 1,
          resultType: 'url',
          values: { url: `task://${taskId}` },
        },
      ],
    };
  }

  private turingSuccess(imageUrls: string[]) {
    return {
      intent: { code: 0 },
      results: imageUrls.map((url) => ({
        groupType: 1,
        resultType: 'image',
        values: { url },
      })),
    };
  }

  private collectImageInputsFromDto(dto: KlingImageGenerateDto): string[] {
    return (dto.images ?? []).map((u) => String(u).trim()).filter(Boolean);
  }

  /**
   * 可灵 `image` / `subject_image`：文档为 https URL 或 **纯 Base64**。
   * 传完整 `data:image/...;base64,...` 时部分环境会报 “File is not in a valid base64 format”，故仅提交逗号后的 Base64 段。
   */
  private toKlingApiImageField(normalized: string): string {
    const s = normalized.trim();
    if (/^https?:\/\//i.test(s)) return s;
    const m = /^data:image\/[^;]+;base64,(.*)$/is.exec(s);
    if (m) return m[1].replace(/\s/g, '');
    return s.replace(/\s/g, '');
  }

  /**
   * 可灵上游：http(s) URL、data: URL 原样传递；裸 Base64 按魔数补全为 data URL。
   */
  private normalizeImageForKlingApi(raw: string): string {
    const s = raw.trim();
    if (!s) {
      throw new BadRequestException('images[] 中存在空项');
    }
    if (/^https?:\/\//i.test(s)) return s;
    if (/^data:/i.test(s)) return s;
    const b64 = s.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length < 32) {
      throw new BadRequestException(
        'images[] 每项须为 http(s) 图片 URL、data:image/...;base64,...，或可解码的图片 Base64',
      );
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      throw new BadRequestException('无效的 Base64 图片');
    }
    if (buf.length < 24) {
      throw new BadRequestException('图片解码后长度过短');
    }
    let mime = 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      mime = 'image/jpeg';
    } else if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      mime = 'image/png';
    } else if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      mime = 'image/gif';
    } else if (
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      mime = 'image/webp';
    }
    return `data:${mime};base64,${b64}`;
  }

  private computeKlingRefTargetDimensions(
    width: number,
    height: number,
  ): { width: number; height: number } {
    if (width < 1 || height < 1) {
      throw new BadRequestException('Invalid image dimensions');
    }
    const maxSide = Math.max(width, height);
    const minSide = Math.min(width, height);
    const sHi = KLING_REF_IMG_MAX_LONG_SIDE / maxSide;
    const sLo = KLING_REF_IMG_MIN_SHORT_SIDE / minSide;
    const scale = sLo <= sHi ? sLo : sHi;
    return {
      width: snapDimensionToMultipleOf8(width * scale),
      height: snapDimensionToMultipleOf8(height * scale),
    };
  }

  /**
   * EXIF 方向纠正、边长约束（短边 ≥300、长边 ≤4096）、宽高对齐 8px、统一为 JPEG，
   * 减轻可灵「Image pixel is invalid」及 WebP/极端长宽比问题。
   */
  private async ensureKlingReferencePixels(buf: Buffer): Promise<Buffer> {
    try {
      const { width, height } = await sharp(buf).rotate().metadata();
      if (!width || !height) {
        throw new BadRequestException(
          'Cannot read reference image width/height; use JPEG/PNG/WebP/GIF',
        );
      }
      const { width: tw, height: th } = this.computeKlingRefTargetDimensions(
        width,
        height,
      );
      return await sharp(buf)
        .rotate()
        .resize(tw, th, { fit: 'fill' })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Reference image processing failed: ${msg}`);
    }
  }

  /** 公网 URL 原样；内联图解码后经 {@link ensureKlingReferencePixels} 再输出纯 Base64 */
  private async resolveKlingImageInputForApi(raw: string): Promise<string> {
    const normalized = this.normalizeImageForKlingApi(raw);
    const s = normalized.trim();
    if (/^https?:\/\//i.test(s)) return s;
    const b64 = this.toKlingApiImageField(normalized);
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) {
      throw new BadRequestException('Empty reference image after decode');
    }
    const jpegBuf = await this.ensureKlingReferencePixels(buf);
    return jpegBuf.toString('base64');
  }

  private parseTuringPerception(perception: Record<string, unknown>): {
    prompt: string;
    urls: string[];
  } {
    const urls: string[] = [];
    let prompt = '';
    const it = perception.inputText;
    if (it && typeof it === 'object' && !Array.isArray(it)) {
      const t = (it as Record<string, unknown>).text;
      if (typeof t === 'string') prompt = t.trim();
    }
    const ii = perception.inputImage;
    if (ii) {
      if (Array.isArray(ii)) {
        for (const x of ii) {
          if (x && typeof x === 'object') {
            const u = (x as Record<string, unknown>).url;
            if (typeof u === 'string' && u.trim()) urls.push(u.trim());
          }
        }
      } else if (typeof ii === 'object') {
        const u = (ii as Record<string, unknown>).url;
        if (typeof u === 'string' && u.trim()) urls.push(u.trim());
      }
    }
    return { prompt, urls };
  }

  private readIntParam(
    kp: Record<string, unknown> | undefined,
    k: string,
  ): number | undefined {
    if (!kp) return undefined;
    const v = kp[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) return Number(v);
    return undefined;
  }

  private readStrParam(
    kp: Record<string, unknown> | undefined,
    k: string,
  ): string | undefined {
    if (!kp) return undefined;
    const v = kp[k];
    return typeof v === 'string' ? v : undefined;
  }

  private async assertActiveConfig(): Promise<{
    accessKey: string;
    secretKey: string;
    baseUrl: string;
    defaultModelSingle: string;
    defaultModelMulti: string;
  }> {
    const c = await this.getConfigRow();
    if (c.enabled !== true) {
      throw new ServiceUnavailableException(
        'Kling image generation is disabled',
      );
    }
    const accessKey = typeof c.accessKey === 'string' ? c.accessKey.trim() : '';
    const secretKey = typeof c.secretKey === 'string' ? c.secretKey.trim() : '';
    if (!accessKey || !secretKey) {
      throw new ServiceUnavailableException(
        'Kling AccessKey / SecretKey 未配置（需在后台填写可灵开放平台密钥，见 document-api 鉴权说明）',
      );
    }
    const base =
      typeof c.baseUrl === 'string' && c.baseUrl.trim()
        ? c.baseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_KLING_HTTP_BASE;
    const defaultModelSingle =
      typeof c.defaultModelSingle === 'string' && c.defaultModelSingle.trim()
        ? c.defaultModelSingle.trim()
        : typeof c.defaultModel === 'string' &&
            c.defaultModel.trim() &&
            !String(c.defaultModel).includes('/')
          ? String(c.defaultModel).trim()
          : DEFAULT_MODEL_SINGLE;
    const defaultModelMulti =
      typeof c.defaultModelMulti === 'string' && c.defaultModelMulti.trim()
        ? c.defaultModelMulti.trim()
        : DEFAULT_MODEL_MULTI;
    return {
      accessKey,
      secretKey,
      baseUrl: base,
      defaultModelSingle,
      defaultModelMulti,
    };
  }

  private getBearer(accessKey: string, secretKey: string): string {
    const now = Date.now();
    const c = this.tokenCache;
    if (
      c &&
      c.accessKey === accessKey &&
      c.secretKey === secretKey &&
      now < c.refreshAfterMs
    ) {
      return c.bearer;
    }
    const jwt = signKlingOfficialJwt(accessKey, secretKey);
    const bearer = `Bearer ${jwt}`;
    this.tokenCache = {
      accessKey,
      secretKey,
      bearer,
      refreshAfterMs: now + 25 * 60 * 1000,
    };
    return bearer;
  }

  private klingUpstreamSignal(): AbortSignal {
    return AbortSignal.timeout(KLING_UPSTREAM_TIMEOUT_MS);
  }

  private mapKlingFetchError(
    e: unknown,
    verb: 'GET' | 'POST',
    path: string,
  ): never {
    const msg = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : '';
    if (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      /aborted|timeout/i.test(msg)
    ) {
      this.logger.error(
        `Kling API ${verb} ${path} timed out after ${KLING_UPSTREAM_TIMEOUT_MS}ms`,
      );
      throw new ServiceUnavailableException(
        `Kling API request timed out after ${KLING_UPSTREAM_TIMEOUT_MS / 1000}s`,
      );
    }
    this.logger.error(`Kling API ${verb} ${path} failed: ${msg}`);
    throw new ServiceUnavailableException(`Kling API unreachable: ${msg}`);
  }

  private async klingPost(
    accessKey: string,
    secretKey: string,
    baseUrl: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getBearer(accessKey, secretKey),
        },
        body: JSON.stringify(body),
        signal: this.klingUpstreamSignal(),
      });
    } catch (e) {
      this.mapKlingFetchError(e, 'POST', path);
    }
    return this.parseKlingEnvelope(await res.text(), res.ok, path);
  }

  private async klingGet(
    accessKey: string,
    secretKey: string,
    baseUrl: string,
    path: string,
  ): Promise<Record<string, unknown>> {
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: this.getBearer(accessKey, secretKey) },
        signal: this.klingUpstreamSignal(),
      });
    } catch (e) {
      this.mapKlingFetchError(e, 'GET', path);
    }
    return this.parseKlingEnvelope(await res.text(), res.ok, path);
  }

  private parseKlingEnvelope(
    text: string,
    httpOk: boolean,
    pathForLog: string,
  ): Record<string, unknown> {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        `Invalid Kling API response (${pathForLog}): ${text.slice(0, 400)}`,
      );
    }
    const code = json.code;
    if (code === 0) return json;
    const codeStr =
      typeof code === 'number' || typeof code === 'string'
        ? String(code)
        : 'unknown';
    const msg =
      typeof json.message === 'string'
        ? json.message
        : !httpOk
          ? text.slice(0, 300)
          : `Kling API error code ${codeStr}`;
    throw new BadRequestException(msg);
  }

  private readUpstreamTaskId(envelope: Record<string, unknown>): string {
    const data = envelope.data as Record<string, unknown> | undefined;
    const idRaw = data?.task_id ?? data?.taskId;
    const id = typeof idRaw === 'string' ? idRaw.trim() : '';
    if (!id) {
      throw new BadRequestException('Kling API response missing data.task_id');
    }
    return id;
  }

  private extractImageUrlsFromQueryData(
    data: Record<string, unknown>,
  ): string[] {
    const urls: string[] = [];
    const tr = data.task_result as Record<string, unknown> | undefined;
    const images = tr?.images;
    if (!Array.isArray(images)) return urls;
    for (const im of images) {
      if (im && typeof im === 'object') {
        const u = (im as Record<string, unknown>).url;
        if (typeof u === 'string' && u.trim()) urls.push(u.trim());
      }
    }
    return urls;
  }

  private async runOfficialTask(opts: {
    mode: KlingPublicTaskMode;
    accessKey: string;
    secretKey: string;
    baseUrl: string;
    createPath: string;
    queryPath: (taskId: string) => string;
    body: Record<string, unknown>;
    sync: boolean;
  }): Promise<
    | { taskId: string; createResponse: Record<string, unknown> }
    | { taskId: string; imageUrls: string[]; task: Record<string, unknown> }
  > {
    const create = await this.klingPost(
      opts.accessKey,
      opts.secretKey,
      opts.baseUrl,
      opts.createPath,
      opts.body,
    );
    const upstreamId = this.readUpstreamTaskId(create);
    const taskId = encodePublicTaskId(opts.mode, upstreamId);
    if (!opts.sync) {
      return { taskId, createResponse: create };
    }
    const out = await this.pollOfficial(
      opts.accessKey,
      opts.secretKey,
      opts.baseUrl,
      opts.queryPath(upstreamId),
    );
    return { taskId, imageUrls: out.imageUrls, task: out.task };
  }

  private async pollOfficial(
    accessKey: string,
    secretKey: string,
    baseUrl: string,
    queryPath: string,
  ): Promise<{ imageUrls: string[]; task: Record<string, unknown> }> {
    const deadline = Date.now() + POLL_MAX_MS;
    while (Date.now() < deadline) {
      const envelope = await this.klingGet(
        accessKey,
        secretKey,
        baseUrl,
        queryPath,
      );
      const data = envelope.data as Record<string, unknown> | undefined;
      if (!data) {
        throw new BadRequestException('Kling task response missing data');
      }
      const status = data.task_status;
      if (status === 'succeed') {
        const urls = this.extractImageUrlsFromQueryData(data);
        return { imageUrls: urls, task: envelope };
      }
      if (status === 'failed') {
        const msg =
          typeof data.task_status_msg === 'string'
            ? data.task_status_msg
            : `Task failed (${String(status)})`;
        throw new BadRequestException(msg);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new BadRequestException(
      'Image generation timed out; use async mode (sync:false) and poll tasks API',
    );
  }
}
