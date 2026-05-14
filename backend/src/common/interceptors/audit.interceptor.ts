import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedAdminUser } from '../types/authenticated-admin-user';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    if (method === 'GET') return next.handle();

    const url = request.originalUrl || request.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/logout')) {
      return next.handle();
    }

    const user = request.user as AuthenticatedAdminUser | undefined;
    if (!user) return next.handle();

    const controller = context.getClass().name.replace('Controller', '');

    const actionMap: Record<string, string> = {
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
    };

    return next.handle().pipe(
      tap((responseData: unknown) => {
        void this.persistOperationLog(
          request,
          user,
          controller,
          method,
          actionMap,
          responseData,
        );
      }),
    );
  }

  private async persistOperationLog(
    request: Request,
    user: AuthenticatedAdminUser,
    controller: string,
    method: string,
    actionMap: Record<string, string>,
    responseData: unknown,
  ): Promise<void> {
    try {
      const rd =
        responseData &&
        typeof responseData === 'object' &&
        !Array.isArray(responseData)
          ? (responseData as { id?: string })
          : undefined;
      await this.prisma.systemOperationLog.create({
        data: {
          adminId: user.id,
          adminEmail: user.email,
          module: controller.toLowerCase(),
          action: actionMap[method] || method.toLowerCase(),
          targetType: controller,
          targetId: String(request.params?.['id'] ?? rd?.id ?? 'unknown'),
          summary: `${user.email} ${actionMap[method] || method} ${controller.toLowerCase()}`,
          metadata: undefined,
          ipAddress: request.ip || request.socket?.remoteAddress || '0.0.0.0',
          userAgent: request.headers['user-agent'],
          appId:
            (request.params as { appId?: string })?.appId ||
            (request.body as { appId?: string })?.appId ||
            undefined,
        },
      });
    } catch {
      // System log failure should not break the request
    }
  }
}
