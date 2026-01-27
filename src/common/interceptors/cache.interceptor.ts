import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import * as crypto from 'crypto';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { CacheService } from '../../Controllers/Cache/cache.service';

export const CACHE_KEY = 'cacheKey';

export const CACHE_TTL = 'cacheTTL';

export const CacheResponse = (key?: string, ttl = 300) =>
  SetMetadata(CACHE_KEY, { key: key || 'default', ttl });

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheConfig = this.reflector.get(CACHE_KEY, context.getHandler());

    if (!cacheConfig) {
      return next.handle();
    }

    const { key: cacheKeyTemplate, ttl } = cacheConfig;
    const request = context.switchToHttp().getRequest();
    const cacheKey = this.generateCacheKey(cacheKeyTemplate, request);

    try {
      // Try to get from cache first
      const cachedResult = await this.cacheService.get(cacheKey);

      if (cachedResult !== undefined) {
        this.logger.debug(`Cache hit for key: ${cacheKey}`);

        return of(cachedResult);
      }

      this.logger.debug(`Cache miss for key: ${cacheKey}`);

      // Cache miss - execute handler and cache result
      return next.handle().pipe(
        tap(async (result) => {
          if (result !== undefined && result !== null) {
            await this.cacheService.set(cacheKey, result, ttl * 1000);
            this.logger.debug(`Cached result for key: ${cacheKey}`);
          }
        }),
      );
    } catch (error) {
      this.logger.error({
        message: 'Cache interceptor error',
        error: error.message,
        cacheKey,
      });

      // On cache error, continue without caching
      return next.handle();
    }
  }

  private generateCacheKey(template: string, request: any): string {
    // Generate cache key based on template and request data
    const baseKey = template
      .replace(':userId', request.user?.id || 'anonymous')
      .replace(
        ':accountId',
        request.params?.accountId || request.body?.accountId || 'default',
      )
      .replace(':path', request.route?.path || request.url);

    // Add query parameters to make key unique
    const queryString = new URLSearchParams(request.query).toString();
    const fullKey = queryString ? `${baseKey}:${queryString}` : baseKey;

    // Hash long keys to prevent issues with cache backends
    if (fullKey.length > 200) {
      return `cache:${crypto.createHash('sha256').update(fullKey).digest('hex')}`;
    }

    return `cache:${fullKey}`;
  }
}
