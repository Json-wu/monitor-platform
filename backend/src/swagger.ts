import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** OpenAPI UI + JSON；与全局前缀合并后为 `/api/docs`、`/api/docs-json`。 */
export function setupSwagger(app: INestApplication): void {
  if (process.env.API_DOCS_ENABLED === 'false') {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('Monitor API')
    .setDescription(
      'Monitor 管理后台与终端用户/公开接口。管理员路由需在 Header 携带 `Authorization: Bearer <token>`（登录见 `POST /api/auth/login`）。部分路由另需 `X-App-Slug` 等，见各接口说明。\n\n' +
        '**文档约定**：已标注 `@ApiOkResponse` 的接口会展示 **响应 Schema** 与 **Examples**（含枚举中文含义）；其余接口将逐步补齐。',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Admin JWT（`POST /api/auth/login` 返回的 access_token）',
      },
      'bearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-App-Slug',
        in: 'header',
        description: '应用 slug（部分公开/代理接口，与 Application.slug 一致）',
      },
      'X-App-Slug',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-User-Id',
        in: 'header',
        description: '终端用户 UUID（抠图/生图公开接口扣积分）',
      },
      'X-User-Id',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // 默认 useGlobalPrefix 为 false 时 UI 在 /docs，与 setGlobalPrefix('api') 不一致会导致 /api/docs 404
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
