import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<{ headers: Record<string, string>; url: string }>();
    const response = context.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const publicMessage =
      status >= 500
        ? 'Beklenmeyen bir hata oluştu.'
        : typeof payload === 'string'
          ? payload
          : 'İstek işlenemedi.';
    response.status(status).json({
      statusCode: status,
      code:
        typeof payload === 'object' && payload && 'code' in payload
          ? payload.code
          : 'REQUEST_FAILED',
      message: publicMessage,
      correlationId: request.headers['x-correlation-id'] ?? 'unknown',
      path: request.url,
      ...(status < 500 && typeof payload === 'object' ? { details: payload } : {}),
    });
  }
}
