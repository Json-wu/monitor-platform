import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

function normalizeHttpExceptionBody(res: string | object): string | object {
  if (typeof res === 'string') return res;
  if (typeof res === 'object' && res !== null && 'message' in res) {
    const raw = (res as { message: unknown }).message;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.join(', ');
  }
  return res;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = normalizeHttpExceptionBody(res);
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      (((exception as { type?: unknown }).type as string | undefined) ===
        'entity.too.large' ||
        ((exception as { status?: unknown }).status as number | undefined) ===
          HttpStatus.PAYLOAD_TOO_LARGE ||
        ((exception as { statusCode?: unknown }).statusCode as
          | number
          | undefined) === HttpStatus.PAYLOAD_TOO_LARGE)
    ) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Payload too large';
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
