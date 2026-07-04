import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string | string[];
  statusCode: number;
}

/**
 * Normalizes every error response to { code, message, statusCode } so all
 * failures carry a semantic code — not just an HTTP status. Domain exceptions
 * already embed their `code`; validation and framework errors get a sensible
 * default; unexpected errors are logged and never leak internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      statusCode: status,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        body = { code: this.defaultCode(status), message: res, statusCode: status };
      } else {
        const r = res as { code?: string; message?: string | string[] };
        body = {
          code: r.code ?? this.defaultCode(status),
          message: r.message ?? exception.message,
          statusCode: status,
        };
      }
    } else {
      // Unexpected: log the detail server-side, return a generic body.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json(body);
  }

  private defaultCode(status: number): string {
    const map: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
    };
    return map[status] ?? 'ERROR';
  }
}
