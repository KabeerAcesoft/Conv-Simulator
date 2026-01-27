import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In certain situations `httpAdapter` might not be available in the
    // constructor method, thus we should resolve it here.
    const { httpAdapter } = this.httpAdapterHost;

    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isProduction = process.env.NODE_ENV === 'production';

    // Log the error
    const errorMessage =
      exception instanceof Error ? exception.message : 'Unknown error';

    const errorStack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error({
      message: 'Unhandled exception',
      error: errorMessage,
      stack: errorStack,
      path: request.url,
      method: request.method,
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] || 'unknown',
    });

    // Extract additional error details if available
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    // Check if exception has custom response data attached (like from APIService)
    const customErrorData = (exception as any).response;

    // Create error response
    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message:
        exception instanceof HttpException
          ? exceptionResponse
          : 'Internal server error',
      // Include custom error data if available (e.g., from external API errors)
      ...(customErrorData && {
        error: customErrorData,
      }),
      // Only include stack trace in development
      ...(!isProduction && errorStack && { stack: errorStack }),
    };

    httpAdapter.reply(response, responseBody, httpStatus);
  }
}
