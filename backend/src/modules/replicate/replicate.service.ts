import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Replicate from 'replicate';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';
import {
  GLOBAL_INTEGRATION_REPLICATE,
} from '../global-integration/global-integration.constants';
import type { PatchReplicateSettingsDto } from './dto/patch-replicate-settings.dto';
import type { UpscaleImageType, UpscaleStrength } from './dto/onblur-multipart.dto';
import type {
  ProHeadshotBackground,
  ProHeadshotOutfit,
  ProHeadshotSize,
  ProHeadshotUseCase,
} from './dto/pro-headshot-multipart.dto';

export const DEFAULT_CODEFORMER_REF = 'sczhou/codeformer';
export const DEFAULT_REAL_ESRGAN_REF = 'philz1337x/clarity-upscaler';
export const DEFAULT_ANIME_UPSCALER_REF = 'psychic-canvas/anime-upscaler';
export const DEFAULT_BLIP_REF =
  'salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746';
export const DEFAULT_LAMA_INPAINT_REF = 'zylim0702/remove-object';
export const DEFAULT_PRO_HEADSHOT_REF = 'flux-kontext-apps/professional-headshot';
export const DEFAULT_DDCOLOR_VERSION =
  'ca494ba129e44e45f661d6ece83c4c98a9a7c774309beca01429b58fce8aa695';
export const DEFAULT_SCRATCH_REPAIR_REF = 'topazlabs/dust-and-scratch-v2';

export interface UpscaleResult {
  outputUrl: string;
  routedType: 'face' | 'general' | 'anime';
}

@Injectable()
export class ReplicateService {
  private readonly logger = new Logger(ReplicateService.name);

  /** Public API responses: English only, no operator / upstream details */
  private static readonly MSG_UNAVAILABLE =
    'Image processing service is temporarily unavailable. Please try again later.';
  private static readonly MSG_UPSTREAM_FAILED =
    'Image processing failed. Please try again later.';
  private static readonly MSG_INVALID_OUTPUT =
    'Image processing did not return a valid result. Please try again later.';
  private static readonly MSG_IMAGE_REQUIRED = 'Image is required.';
  private static readonly MSG_MASK_REQUIRED = 'Mask is required.';

  constructor(
    private readonly globalIntegration: GlobalIntegrationSettingsService,
  ) {}

  private upstreamFailed(logContext: string, error: unknown): never {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(`${logContext}: ${detail}`);
    throw new BadGatewayException(ReplicateService.MSG_UPSTREAM_FAILED);
  }

  private missingOutput(logContext: string): never {
    this.logger.warn(`${logContext}: no output URL`);
    throw new BadGatewayException(ReplicateService.MSG_INVALID_OUTPUT);
  }

  private integrationUnavailable(reason: string): never {
    this.logger.warn(`Replicate unavailable: ${reason}`);
    throw new ServiceUnavailableException(ReplicateService.MSG_UNAVAILABLE);
  }

  private async resolveRef(ref: string, token: string): Promise<string> {
    if (ref.includes(':')) return ref;
    const [owner, name] = ref.split('/');
    if (!owner || !name) return ref;
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    try {
      const page = await replicate.models.versions.list(owner, name);
      const latest = page.results?.[0];
      if (latest?.id) return `${owner}/${name}:${latest.id}`;
    } catch {}
    return ref;
  }

  private normalizeReplicateImageUrl(output: unknown): string | undefined {
    if (typeof output === 'string') {
      const s = output.trim();
      return s || undefined;
    }
    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      if (typeof first === 'string') return first.trim() || undefined;
    }
    if (output && typeof output === 'object' && !Array.isArray(output)) {
      const o = output as Record<string, unknown>;
      for (const key of ['url', 'uri', 'href', 'output', 'image']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return undefined;
  }

  private async getConfigRow(): Promise<Record<string, unknown>> {
    return this.globalIntegration.getConfig(GLOBAL_INTEGRATION_REPLICATE);
  }

  async patchAdminSettings(dto: PatchReplicateSettingsDto): Promise<void> {
    await this.globalIntegration.mergeConfig(GLOBAL_INTEGRATION_REPLICATE, (raw) => {
      const next = { ...raw };
      if (dto.enabled !== undefined) next.enabled = dto.enabled;
      if (dto.apiToken !== undefined) {
        next.apiToken = dto.apiToken.trim() === '' ? '' : dto.apiToken.trim();
      }
      if (dto.codeformerRef !== undefined) next.codeformerRef = dto.codeformerRef.trim();
      if (dto.realEsrganRef !== undefined) next.realEsrganRef = dto.realEsrganRef.trim();
      if (dto.animeUpscalerRef !== undefined) next.animeUpscalerRef = dto.animeUpscalerRef.trim();
      if (dto.blipRef !== undefined) next.blipRef = dto.blipRef.trim();
      if (dto.defaultType !== undefined) next.defaultType = dto.defaultType;
      if (dto.lamaInpaintRef !== undefined) next.lamaInpaintRef = dto.lamaInpaintRef.trim();
      if (dto.proHeadshotRef !== undefined) next.proHeadshotRef = dto.proHeadshotRef.trim();
      if (dto.ddcolorVersion !== undefined) {
        const v = dto.ddcolorVersion.trim();
        next.ddcolorVersion = v === '' ? '' : v;
      }
      if (dto.ddcolorDefaultModelSize !== undefined) {
        next.ddcolorDefaultModelSize = dto.ddcolorDefaultModelSize;
      }
      if (dto.scratchRepairRef !== undefined) {
        next.scratchRepairRef = dto.scratchRepairRef.trim();
      }
      return next;
    });
  }

  async getSettingsForAdmin(): Promise<{
    enabled: boolean;
    apiTokenSet: boolean;
    codeformerRef: string;
    realEsrganRef: string;
    animeUpscalerRef: string;
    lamaInpaintRef: string;
    proHeadshotRef: string;
    ddcolorVersion: string;
    ddcolorVersionIsDefault: boolean;
    ddcolorDefaultModelSize: 'large' | 'tiny';
    scratchRepairRef: string;
    blipRef: string;
    defaultType: UpscaleImageType;
  }> {
    const c = await this.getConfigRow();
    const token = typeof c.apiToken === 'string' ? c.apiToken.trim() : '';
    const ddVerRaw = typeof c.ddcolorVersion === 'string' ? c.ddcolorVersion.trim() : '';
    const ddcolorVersion = /^[a-f0-9]{64}$/i.test(ddVerRaw) ? ddVerRaw : DEFAULT_DDCOLOR_VERSION;
    const ddcolorDefaultModelSize = c.ddcolorDefaultModelSize === 'tiny' ? 'tiny' : 'large';
    return {
      enabled: c.enabled === true,
      apiTokenSet: token.length > 0,
      codeformerRef:
        typeof c.codeformerRef === 'string' && c.codeformerRef.trim()
          ? c.codeformerRef.trim()
          : DEFAULT_CODEFORMER_REF,
      realEsrganRef:
        typeof c.realEsrganRef === 'string' && c.realEsrganRef.trim()
          ? c.realEsrganRef.trim()
          : DEFAULT_REAL_ESRGAN_REF,
      animeUpscalerRef:
        typeof c.animeUpscalerRef === 'string' && c.animeUpscalerRef.trim()
          ? c.animeUpscalerRef.trim()
          : DEFAULT_ANIME_UPSCALER_REF,
      lamaInpaintRef:
        typeof c.lamaInpaintRef === 'string' && c.lamaInpaintRef.trim()
          ? c.lamaInpaintRef.trim()
          : DEFAULT_LAMA_INPAINT_REF,
      proHeadshotRef:
        typeof c.proHeadshotRef === 'string' && c.proHeadshotRef.trim()
          ? c.proHeadshotRef.trim() === 'lucataco/instantid'
            ? DEFAULT_PRO_HEADSHOT_REF
            : c.proHeadshotRef.trim()
          : DEFAULT_PRO_HEADSHOT_REF,
      ddcolorVersion,
      ddcolorVersionIsDefault: !/^([a-f0-9]{64})$/i.test(ddVerRaw),
      ddcolorDefaultModelSize,
      scratchRepairRef:
        typeof c.scratchRepairRef === 'string' && c.scratchRepairRef.trim()
          ? c.scratchRepairRef.trim()
          : DEFAULT_SCRATCH_REPAIR_REF,
      blipRef:
        typeof c.blipRef === 'string' && c.blipRef.trim()
          ? c.blipRef.trim()
          : DEFAULT_BLIP_REF,
      defaultType:
        ['auto', 'face', 'general', 'anime'].includes(c.defaultType as string)
          ? (c.defaultType as UpscaleImageType)
          : 'auto',
    };
  }

  private async assertReady(): Promise<{
    token: string;
    codeformerRef: string;
    realEsrganRef: string;
    animeUpscalerRef: string;
    blipRef: string;
    defaultType: UpscaleImageType;
  }> {
    const s = await this.getSettingsForAdmin();
    if (!s.enabled) {
      this.integrationUnavailable('integration disabled');
    }
    if (!s.apiTokenSet) {
      this.integrationUnavailable('API token not configured');
    }
    const c = await this.getConfigRow();
    const token = String(c.apiToken ?? '').trim();
    return {
      token,
      codeformerRef: s.codeformerRef,
      realEsrganRef: s.realEsrganRef,
      animeUpscalerRef: s.animeUpscalerRef,
      blipRef: s.blipRef,
      defaultType: s.defaultType,
    };
  }

  private async detectImageType(
    image: string,
    blipRef: string,
    token: string,
  ): Promise<'face' | 'general' | 'anime'> {
    if (!blipRef.trim()) return 'general';
    const resolvedBlipRef = await this.resolveRef(blipRef, token);
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    try {
      const output = await replicate.run(
        resolvedBlipRef as `${string}/${string}` | `${string}/${string}:${string}`,
        {
          input: { image, task: 'image_captioning' },
          wait: { mode: 'poll', interval: 1000 },
        },
      );
      const caption =
        (typeof output === 'string'
          ? output
          : Array.isArray(output)
            ? String(output[0] ?? '')
            : ''
        ).toLowerCase();
      if (/\b(anime|cartoon|illustration|manga|drawing|sketch|comic|pixel[- ]?art|animated|2d)\b/.test(caption)) {
        return 'anime';
      }
      if (/\b(person|face|man|woman|girl|boy|portrait|human|people|lady|gentleman|child|kid|baby)\b/.test(caption)) {
        return 'face';
      }
      return 'general';
    } catch {
      return 'general';
    }
  }

  private async runCodeformer(
    image: string,
    ref: string,
    token: string,
    strength: UpscaleStrength = 'standard',
  ): Promise<string> {
    const fidelity = strength === 'strong' ? 0.12 : 0.65;
    const resolvedRef = await this.resolveRef(ref, token);
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    let output: unknown;
    try {
      output = await replicate.run(
        resolvedRef as `${string}/${string}` | `${string}/${string}:${string}`,
        {
          input: {
            image,
            upscale: 2,
            face_upsample: true,
            background_enhance: true,
            codeformer_fidelity: fidelity,
          },
          wait: { mode: 'poll', interval: 2000 },
        },
      );
    } catch (e: unknown) {
      this.upstreamFailed('CodeFormer', e);
    }
    const url = this.normalizeReplicateImageUrl(output);
    if (!url) this.missingOutput('CodeFormer');
    return url;
  }

  private async runGeneralUpscaler(
    image: string,
    ref: string,
    scale: 2 | 4,
    token: string,
    strength: UpscaleStrength = 'standard',
  ): Promise<string> {
    const resolvedRef = await this.resolveRef(ref, token);
    const refLower = resolvedRef.toLowerCase();
    const replicate = new Replicate({ auth: token, useFileOutput: false });

    let input: Record<string, unknown>;
    if (refLower.includes('clarity-upscaler') || refLower.includes('clarity_upscaler')) {
      const creativity = strength === 'strong' ? 0.55 : 0.22;
      const resemblance = strength === 'strong' ? 0.45 : 0.72;
      const num_inference_steps = strength === 'strong' ? 22 : 16;
      input = {
        image,
        scale_factor: scale,
        prompt: 'masterpiece, best quality, highres, ultra-detailed',
        negative_prompt: 'worst quality, low quality, normal quality, lowres, blurry',
        dynamic: strength === 'strong' ? 7 : 6,
        creativity,
        resemblance,
        tiling_width: 112,
        tiling_height: 144,
        num_inference_steps,
        guidance_scale: strength === 'strong' ? 5 : 4,
        output_format: 'webp',
      };
    } else if (refLower.includes('esrgan') || refLower.includes('realesrgan')) {
      input = { image, scale };
    } else {
      input = { image, scale, scale_factor: scale };
    }

    let output: unknown;
    try {
      output = await replicate.run(
        resolvedRef as `${string}/${string}` | `${string}/${string}:${string}`,
        { input, wait: { mode: 'poll', interval: 2000 } },
      );
    } catch (e: unknown) {
      this.upstreamFailed('general upscaler', e);
    }
    const url = this.normalizeReplicateImageUrl(output);
    if (!url) this.missingOutput('general upscaler');
    return url;
  }

  private async runAnimeUpscaler(
    image: string,
    ref: string,
    token: string,
  ): Promise<string> {
    const resolvedRef = await this.resolveRef(ref, token);
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    let output: unknown;
    try {
      output = await replicate.run(
        resolvedRef as `${string}/${string}` | `${string}/${string}:${string}`,
        {
          input: { image },
          wait: { mode: 'poll', interval: 2000 },
        },
      );
    } catch (e: unknown) {
      this.upstreamFailed('anime upscaler', e);
    }
    const url = this.normalizeReplicateImageUrl(output);
    if (!url) this.missingOutput('anime upscaler');
    return url;
  }

  async upscale(dto: {
    image: string;
    type?: UpscaleImageType;
    scale?: 2 | 4;
    strength?: UpscaleStrength;
  }): Promise<UpscaleResult> {
    const { token, codeformerRef, realEsrganRef, animeUpscalerRef, blipRef, defaultType } =
      await this.assertReady();

    const image = dto.image?.trim();
    if (!image) throw new BadRequestException(ReplicateService.MSG_IMAGE_REQUIRED);

    const scale = dto.scale ?? 4;
    const strength = dto.strength ?? 'standard';
    const requestedType = dto.type ?? defaultType;

    let routedType: 'face' | 'general' | 'anime';
    if (requestedType === 'auto') {
      routedType = await this.detectImageType(image, blipRef, token);
    } else {
      routedType = requestedType;
    }

    let outputUrl: string;
    switch (routedType) {
      case 'face':
        outputUrl = await this.runCodeformer(image, codeformerRef, token, strength);
        break;
      case 'anime':
        outputUrl = await this.runAnimeUpscaler(image, animeUpscalerRef, token);
        break;
      default:
        outputUrl = await this.runGeneralUpscaler(image, realEsrganRef, scale, token, strength);
    }

    return { outputUrl, routedType };
  }

  async inpaintObjectRemoval(dto: { image: string; mask: string }): Promise<{
    outputUrl: string;
  }> {
    const s = await this.getSettingsForAdmin();
    if (!s.enabled) {
      this.integrationUnavailable('integration disabled');
    }
    if (!s.apiTokenSet) {
      this.integrationUnavailable('API token not configured');
    }
    const c = await this.getConfigRow();
    const token = String(c.apiToken ?? '').trim();
    const image = dto.image?.trim();
    const mask = dto.mask?.trim();
    if (!image) {
      throw new BadRequestException(ReplicateService.MSG_IMAGE_REQUIRED);
    }
    if (!mask) {
      throw new BadRequestException(ReplicateService.MSG_MASK_REQUIRED);
    }
    const ref = s.lamaInpaintRef;
    const resolvedRef = await this.resolveRef(ref, token);
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    let output: unknown;
    try {
      output = await replicate.run(
        resolvedRef as `${string}/${string}` | `${string}/${string}:${string}`,
        {
          input: { image, mask },
          wait: { mode: 'poll', interval: 2000 },
        },
      );
    } catch (e: unknown) {
      this.upstreamFailed('inpainting', e);
    }
    const outputUrl = this.normalizeReplicateImageUrl(output);
    if (!outputUrl) {
      this.missingOutput('inpainting');
    }
    return { outputUrl };
  }

  private proHeadshotPromptParts(input: {
    background: ProHeadshotBackground;
    outfit: ProHeadshotOutfit;
    useCase: ProHeadshotUseCase;
  }): string[] {
    const bgMap: Record<ProHeadshotBackground, string> = {
      white: 'pure white seamless background',
      black: 'solid black studio background',
      neutral: 'clean neutral studio background',
      gray: 'clean neutral gray studio background',
      office: 'soft corporate office bokeh background',
    };
    const outfitMap: Record<ProHeadshotOutfit, string> = {
      'business-formal': 'business formal attire, polished and premium',
      'business-casual': 'business casual attire, clean and modern',
      blazer: 'tailored blazer, sharp business look',
      shirt: 'neat dress shirt, professional look',
    };
    const useCaseMap: Record<ProHeadshotUseCase, string> = {
      linkedin: 'LinkedIn-ready corporate headshot',
      resume: 'resume-ready professional portrait',
      'company-profile': 'company profile professional portrait',
      'id-photo': 'passport-style compliant identity photo look',
    };
    return [
      useCaseMap[input.useCase],
      bgMap[input.background],
      outfitMap[input.outfit],
      'natural skin texture, realistic lighting, 85mm portrait lens, high detail, authentic face identity',
    ];
  }

  private proHeadshotAspectRatio(size: ProHeadshotSize): '1:1' | '4:5' | '2:3' {
    return size;
  }

  async proHeadshot(dto: {
    image: string;
    size: ProHeadshotSize;
    background: ProHeadshotBackground;
    outfit: ProHeadshotOutfit;
    useCase: ProHeadshotUseCase;
    outputs: 1 | 2 | 4;
    safetyTolerance: 0 | 1 | 2;
  }): Promise<{ outputUrls: string[] }> {
    const s = await this.getSettingsForAdmin();
    if (!s.enabled) {
      this.integrationUnavailable('integration disabled');
    }
    if (!s.apiTokenSet) {
      this.integrationUnavailable('API token not configured');
    }
    const c = await this.getConfigRow();
    const token = String(c.apiToken ?? '').trim();
    const image = dto.image?.trim();
    if (!image) throw new BadRequestException(ReplicateService.MSG_IMAGE_REQUIRED);

    const ref = s.proHeadshotRef;
    const resolvedRef = await this.resolveRef(ref, token);
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    const prompt = this.proHeadshotPromptParts(dto).join(', ');
    const aspectRatio = this.proHeadshotAspectRatio(dto.size);
    const outputs = Math.min(Math.max(dto.outputs, 1), 4) as 1 | 2 | 4;
    const baseSeed = Math.floor(Math.random() * 1_000_000_000);
    const tasks = Array.from({ length: outputs }, (_, i) =>
      replicate.run(
        resolvedRef as `${string}/${string}` | `${string}/${string}:${string}`,
        {
          input: {
            image,
            input_image: image,
            prompt,
            background: dto.background,
            aspect_ratio: aspectRatio,
            safety_tolerance: dto.safetyTolerance,
            output_format: 'png',
            seed: baseSeed + i,
          },
          wait: { mode: 'poll', interval: 2000 },
        },
      ),
    );
    const settled = await Promise.allSettled(tasks);
    const outputUrls: string[] = [];
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        const v = item.value;
        if (Array.isArray(v)) {
          for (const x of v) {
            if (typeof x === 'string' && x.trim()) outputUrls.push(x.trim());
          }
        } else {
          const url = this.normalizeReplicateImageUrl(v);
          if (url) outputUrls.push(url);
        }
      }
    }

    if (outputUrls.length === 0) {
      const firstError = settled.find((item) => item.status === 'rejected');
      if (firstError && firstError.status === 'rejected') {
        this.upstreamFailed('pro headshot', firstError.reason);
      }
      this.missingOutput('pro headshot');
    }
    return { outputUrls };
  }

  async colorize(dto: { image: string; model?: 'large' | 'tiny' }): Promise<{ outputUrl: string }> {
    const s = await this.getSettingsForAdmin();
    if (!s.enabled) {
      this.integrationUnavailable('integration disabled');
    }
    if (!s.apiTokenSet) {
      this.integrationUnavailable('API token not configured');
    }
    const c = await this.getConfigRow();
    const token = String(c.apiToken ?? '').trim();

    const image = dto.image?.trim();
    if (!image) {
      throw new BadRequestException(ReplicateService.MSG_IMAGE_REQUIRED);
    }
    const model_size = dto.model ?? s.ddcolorDefaultModelSize;
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    let output: unknown;
    try {
      output = await replicate.run(`piddnad/ddcolor:${s.ddcolorVersion}`, {
        input: { image, model_size },
        wait: { mode: 'poll', interval: 1500 },
      });
    } catch (e: unknown) {
      this.upstreamFailed('colorize', e);
    }
    const outputUrl = this.normalizeReplicateImageUrl(output);
    if (!outputUrl?.trim()) {
      this.missingOutput('colorize');
    }
    return { outputUrl: outputUrl.trim() };
  }

  /** 自动检测并修复老照片划痕/污渍（Topaz Dust and Scratch 或后台配置的模型） */
  async cleanScratches(dto: { image: string }): Promise<{ outputUrl: string }> {
    const s = await this.getSettingsForAdmin();
    if (!s.enabled) {
      this.integrationUnavailable('integration disabled');
    }
    if (!s.apiTokenSet) {
      this.integrationUnavailable('API token not configured');
    }
    const c = await this.getConfigRow();
    const token = String(c.apiToken ?? '').trim();
    const image = dto.image?.trim();
    if (!image) {
      throw new BadRequestException(ReplicateService.MSG_IMAGE_REQUIRED);
    }
    const ref = s.scratchRepairRef;
    const resolvedRef = await this.resolveRef(ref, token);
    const replicate = new Replicate({ auth: token, useFileOutput: false });
    let output: unknown;
    try {
      output = await replicate.run(
        resolvedRef as `${string}/${string}` | `${string}/${string}:${string}`,
        {
          input: { image },
          wait: { mode: 'poll', interval: 2000 },
        },
      );
    } catch (e: unknown) {
      this.upstreamFailed('scratch repair', e);
    }
    const outputUrl = this.normalizeReplicateImageUrl(output);
    if (!outputUrl?.trim()) {
      this.missingOutput('scratch repair');
    }
    return { outputUrl: outputUrl.trim() };
  }
}
