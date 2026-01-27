import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  RequestTimeoutException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

export const TIMEOUT_KEY = 'timeout';

export const Timeout = (ms: number) => SetMetadata(TIMEOUT_KEY, ms);

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimeoutInterceptor.name);
  private readonly defaultTimeout = 30000; // 30 seconds

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const timeoutValue =
      this.reflector.get<number>(TIMEOUT_KEY, context.getHandler()) ||
      this.defaultTimeout;

    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      timeout(timeoutValue),
      catchError((error) => {
        if (error instanceof TimeoutError) {
          this.logger.warn({
            message: 'Request timeout',
            timeout: timeoutValue,
            url: request.url,
            method: request.method,
            traceId: request.traceId,
          });

          return throwError(
            () => new RequestTimeoutException('Request timeout'),
          );
        }

        return throwError(() => error);
      }),
    );
  }
}
