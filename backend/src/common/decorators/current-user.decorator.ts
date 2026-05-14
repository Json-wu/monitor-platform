import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAdminUser } from '../types/authenticated-admin-user';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): AuthenticatedAdminUser | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedAdminUser }>();
    return request.user;
  },
);
