import './env-bootstrap';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaService } from './prisma/prisma.service';
import { setupSwagger } from './swagger';
import { json, urlencoded } from 'express';
import {
  isGumroadWebhookPath,
  type RequestWithRawBody,
} from './common/utils/raw-body.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Allow large base64 JSON payloads for public image generation APIs.
  app.use(json({ limit: '30mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: '30mb',
      verify: (req, _res, buf) => {
        if (isGumroadWebhookPath(req.url)) {
          (req as RequestWithRawBody).rawBody = buf;
        }
      },
    }),
  );

  /** 合并 CORS_ORIGINS、FRONTEND_URL、ADMIN_ORIGIN，避免只配了 CORS_ORIGINS 时漏掉管理后台来源 */
  function collectCorsOrigins(): string[] {
    const parts: string[] = [];
    const pushCsv = (raw?: string) => {
      if (!raw?.trim()) return;
      for (const s of raw.split(',')) {
        const t = s.trim();
        if (t) parts.push(t);
      }
    };
    pushCsv(process.env.CORS_ORIGINS);
    pushCsv(process.env.FRONTEND_URL);
    pushCsv(process.env.ADMIN_ORIGIN);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of parts) {
      if (!seen.has(o)) {
        seen.add(o);
        out.push(o);
      }
    }
    // 本地开发：管理后台默认 3002（见 monitor/frontend/package.json），避免仅配了 3001 时漏掉 3002
    if (process.env.NODE_ENV !== 'production') {
      for (const o of ['http://localhost:3001', 'http://localhost:3002']) {
        if (!seen.has(o)) {
          seen.add(o);
          out.push(o);
        }
      }
    }
    return out.length > 0
      ? out
      : ['http://localhost:3001', 'http://localhost:3002'];
  }
  const corsOrigins = collectCorsOrigins();

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-App-Slug',
      'X-Api-Key',
      'X-User-Id',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const prismaService = app.get(PrismaService);
  app.useGlobalInterceptors(new AuditInterceptor(prismaService));

  setupSwagger(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  const docsHint =
    process.env.API_DOCS_ENABLED === 'false'
      ? ''
      : `  API docs: http://localhost:${port}/api/docs`;
  console.log(`Monitor API running on http://localhost:${port}/api${docsHint}`);
}
void bootstrap();
