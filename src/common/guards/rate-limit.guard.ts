import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CacheService } from '../../Controllers/Cache/cache.service';

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (limit: number, ttl = 60000) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, ttl });

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitConfig = this.reflector.get(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!rateLimitConfig) {
      return true; // No rate limiting configured
    }

    const { limit, ttl } = rateLimitConfig;
    const request = context.switchToHttp().getRequest();

    const clientIp =
      request.ip || request.connection.remoteAddress || 'unknown';

    const userAgent = request.headers['user-agent'] || 'unknown';
    const path = request.route?.path || request.url;

    // Create a unique key for this client/endpoint combination
    const key = `ratelimit:${clientIp}:${path}`;

    try {
      const current = (await this.cacheService.get<number>(key)) || 0;

      if (current >= limit) {
        this.logger.warn({
          message: 'Rate limit exceeded',
          clientIp,
          userAgent,
          path,
          current,
          limit,
        });

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests',
            retryAfter: Math.ceil(ttl / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Increment counter
      await this.cacheService.set(key, current + 1, ttl);

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error({
        message: 'Rate limiting error',
        error: error.message,
        clientIp,
        path,
      });

      // On cache error, allow request but log it
      return true;
    }
  }
}
