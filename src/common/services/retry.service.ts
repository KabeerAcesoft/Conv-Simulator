import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  private defaultOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    retryCondition: (error) => this.isRetryableError(error),
  };

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    let lastError: any;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (!config.retryCondition(error) || attempt === config.maxAttempts) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay,
        );

        this.logger.warn({
          message: 'Operation failed, retrying',
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: error.message,
        });

        // Call retry callback if provided
        if (config.onRetry) {
          config.onRetry(error, attempt);
        }

        // Wait before retrying
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute a database operation with retry logic
   */
  async executeDatabaseOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    return this.executeWithRetry(operation, {
      maxAttempts: 3,
      baseDelay: 500,
      maxDelay: 5000,
      retryCondition: (error) => this.isDatabaseRetryableError(error),
      onRetry: (error, attempt) => {
        this.logger.warn({
          message: `Database operation ${operationName} failed, retrying`,
          attempt,
          error: error.message,
        });
      },
    });
  }

  /**
   * Execute an external API call with retry logic
   */
  async executeApiCall<T>(
    operation: () => Promise<T>,
    apiName: string,
  ): Promise<T> {
    return this.executeWithRetry(operation, {
      maxAttempts: 4,
      baseDelay: 1000,
      maxDelay: 15000,
      retryCondition: (error) => this.isApiRetryableError(error),
      onRetry: (error, attempt) => {
        this.logger.warn({
          message: `API call to ${apiName} failed, retrying`,
          attempt,
          error: error.message,
          statusCode: error.response?.status,
        });
      },
    });
  }

  /**
   * Execute a cache operation with retry logic
   */
  async executeCacheOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    return this.executeWithRetry(operation, {
      maxAttempts: 2,
      baseDelay: 200,
      maxDelay: 1000,
      retryCondition: (error) => this.isCacheRetryableError(error),
      onRetry: (error, attempt) => {
        this.logger.debug({
          message: `Cache operation ${operationName} failed, retrying`,
          attempt,
          error: error.message,
        });
      },
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any): boolean {
    // Generic retryable error conditions
    if (
      error.code === 'ECONNRESET' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED'
    ) {
      return true;
    }

    if (error.message?.includes('timeout')) {
      return true;
    }

    return false;
  }

  private isDatabaseRetryableError(error: any): boolean {
    // Firestore/database specific retryable errors
    const retryableCodes = [
      'ABORTED',
      'UNAVAILABLE',
      'DEADLINE_EXCEEDED',
      'INTERNAL',
      'RESOURCE_EXHAUSTED',
    ];

    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    // Connection errors
    if (this.isRetryableError(error)) {
      return true;
    }

    return false;
  }

  private isApiRetryableError(error: any): boolean {
    // HTTP status codes that are retryable
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    if (
      error.response &&
      retryableStatusCodes.includes(error.response.status)
    ) {
      return true;
    }

    // Network errors
    if (this.isRetryableError(error)) {
      return true;
    }

    return false;
  }

  private isCacheRetryableError(error: any): boolean {
    // Redis/cache specific retryable errors
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      return true;
    }

    if (
      error.message &&
      (error.message.includes('Connection lost') ||
        error.message.includes('Connection closed') ||
        error.message.includes('timeout'))
    ) {
      return true;
    }

    return false;
  }
}
