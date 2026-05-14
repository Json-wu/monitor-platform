import { BadRequestException, Injectable } from '@nestjs/common';
import { KlingImageService } from '../kling-image/kling-image.service';
import type { RoomDecorationGenerateDto } from './dto/room-decoration-generate.dto';

const REF_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const KLING_PROMPT_MAX = 2500;
const KLING_NEGATIVE_MAX = 2500;

const ROOM_TYPE_EN: Record<string, string> = {
  living_room: 'living room',
  dining_room: 'dining room',
  bedroom: 'bedroom',
  bathroom: 'bathroom',
  office: 'office',
  kitchen: 'kitchen',
  basement: 'basement',
  outdoor_patio: 'outdoor patio',
  gaming_room: 'gaming room',
};

const QUALITY_EN: Record<string, string> = {
  standard: 'standard quality and detail',
  high: 'high quality, sharp detail',
  ultra:
    'ultra high quality, photorealistic, magazine-grade interior photography',
};

export function dedupeRoomDecorationThemes(themes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of themes) {
    const t = String(raw).trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function buildDecorationPrompt(
  themeId: string,
  roomType: string,
  quality: string,
  userExtra?: string,
): string {
  const room = ROOM_TYPE_EN[roomType] ?? roomType.replace(/_/g, ' ');
  const q = QUALITY_EN[quality] ?? quality;
  let base = `Professional interior design render of a ${room}, ${themeId} style, ${q}, well-lit, cohesive furniture and materials`;
  if (userExtra?.trim()) {
    base = `${base}. ${userExtra.trim()}`;
  }
  return base;
}

export type RoomDecorationKlingResultItem = {
  theme: string;
  taskId?: string;
  imageUrls?: string[];
  task?: Record<string, unknown>;
  createResponse?: Record<string, unknown>;
};

@Injectable()
export class TuringRoomDecorationService {
  constructor(private readonly kling: KlingImageService) {}

  /** 校验参考图体积；返回 trim 后的字符串（可传可灵 normalize） */
  assertReferenceImageReasonable(referenceImage: string): string {
    const s = referenceImage.trim();
    if (!s) throw new BadRequestException('referenceImage is required');

    let b64 = s;
    if (/^data:/i.test(s)) {
      const i = s.indexOf(',');
      b64 = i >= 0 ? s.slice(i + 1) : '';
    } else {
      b64 = s.replace(/\s/g, '');
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      throw new BadRequestException('referenceImage is not valid base64');
    }
    if (buf.length > REF_IMAGE_MAX_BYTES) {
      throw new BadRequestException('referenceImage exceeds size limit');
    }
    if (buf.length < 32) {
      throw new BadRequestException('referenceImage decoded payload too small');
    }
    return s;
  }

  /**
   * 按主题依次调用可灵单图参考 `/v1/images/generations`（与公开生图相同栈）。
   */
  async generateViaKling(dto: RoomDecorationGenerateDto): Promise<{
    results: RoomDecorationKlingResultItem[];
  }> {
    const themes = dedupeRoomDecorationThemes(dto.themes);
    if (themes.length < 1 || themes.length > 4) {
      throw new BadRequestException(
        'themes must have 1–4 items after trim/dedupe',
      );
    }
    const ref = this.assertReferenceImageReasonable(dto.referenceImage);

    const neg = dto.negativePrompt?.trim();
    if (neg && neg.length > KLING_NEGATIVE_MAX) {
      throw new BadRequestException(
        `negativePrompt exceeds ${KLING_NEGATIVE_MAX} characters (Kling limit)`,
      );
    }

    const model = await this.kling.resolveModelForRoomDecoration(
      dto.roomDecorationModelId,
    );

    const results: RoomDecorationKlingResultItem[] = [];

    for (const theme of themes) {
      const prompt = buildDecorationPrompt(
        theme,
        dto.roomType,
        dto.quality,
        dto.prompt,
      );
      if (prompt.length > KLING_PROMPT_MAX) {
        throw new BadRequestException(
          `Composed prompt exceeds ${KLING_PROMPT_MAX} characters (Kling limit)`,
        );
      }
      const raw = await this.kling.generateFromDto({
        prompt,
        negative_prompt: neg || undefined,
        images: [ref],
        model,
        n: 1,
        sync: dto.sync !== false,
      });
      const entry: RoomDecorationKlingResultItem = { theme };
      if ('taskId' in raw && typeof raw.taskId === 'string') {
        entry.taskId = raw.taskId;
      }
      if ('imageUrls' in raw && Array.isArray(raw.imageUrls)) {
        entry.imageUrls = raw.imageUrls as string[];
      }
      if ('task' in raw && raw.task && typeof raw.task === 'object') {
        entry.task = raw.task as Record<string, unknown>;
      }
      if (
        'createResponse' in raw &&
        raw.createResponse &&
        typeof raw.createResponse === 'object'
      ) {
        entry.createResponse = raw.createResponse as Record<string, unknown>;
      }
      results.push(entry);
    }

    return { results };
  }
}
