import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ path?: string; originalUrl?: string }>();
    const path = req.path ?? req.originalUrl?.split('?')[0] ?? '';
    // Swagger UI / OpenAPI JSON（useGlobalPrefix:true 时为 /api/docs；旧行为无前缀时为 /docs）
    if (
      path === '/api/docs' ||
      path === '/api/docs-json' ||
      path.startsWith('/api/docs/') ||
      path === '/docs' ||
      path === '/docs-json' ||
      path.startsWith('/docs/')
    ) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
