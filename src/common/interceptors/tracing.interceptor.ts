import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';

import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Generate or extract trace ID
    const traceId = request.headers['x-trace-id'] || randomUUID();
    const spanId = randomUUID();
    const parentSpanId = request.headers['x-parent-span-id'] || null;

    // Add trace information to request
    request.traceId = traceId;
    request.spanId = spanId;
    request.parentSpanId = parentSpanId;

    // Add trace headers to response
    response.setHeader('X-Trace-ID', traceId);
    response.setHeader('X-Span-ID', spanId);

    const startTime = Date.now();
    const handler = context.getHandler();
    const controller = context.getClass();

    const operationName = `${controller.name}.${handler.name}`;

    // Start span
    this.startSpan(traceId, spanId, parentSpanId, operationName, request);

    return next.handle().pipe(
      tap((result) => {
        const duration = Date.now() - startTime;

        this.finishSpan(
          traceId,
          spanId,
          operationName,
          duration,
          'success',
          result,
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        this.finishSpan(
          traceId,
          spanId,
          operationName,
          duration,
          'error',
          null,
          error,
        );

        throw error;
      }),
    );
  }

  private startSpan(
    traceId: string,
    spanId: string,
    parentSpanId: string | null,
    operationName: string,
    request: any,
  ) {
    this.logger.debug({
      event: 'span_start',
      traceId,
      spanId,
      parentSpanId,
      operationName,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      timestamp: new Date().toISOString(),
    });
  }

  private finishSpan(
    traceId: string,
    spanId: string,
    operationName: string,
    duration: number,
    status: 'error' | 'success',
    result?: any,
    error?: any,
  ) {
    this.logger.debug({
      event: 'span_finish',
      traceId,
      spanId,
      operationName,
      duration,
      status,
      ...(error && { error: error.message, stack: error.stack }),
      timestamp: new Date().toISOString(),
    });
  }
}
