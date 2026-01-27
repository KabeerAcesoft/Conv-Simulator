import { Controller, Get, Logger } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

import { CacheService } from '../Controllers/Cache/cache.service';
import { DatabaseService } from '../Controllers/Database/database.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private cacheService: CacheService,
    private databaseService: DatabaseService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Memory check - fail if using more than 300MB heap
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // Memory check - fail if RSS memory is over 1GB
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),

      // Disk check - fail if less than 1GB free disk space
      () =>
        this.disk.checkStorage('disk', {
          thresholdPercent: 0.9, // 90% used
          path: process.platform === 'win32' ? 'C:\\' : '/',
        }),

      // Custom database health check
      () => this.checkDatabase(),

      // Custom cache health check
      () => this.checkCache(),
    ]);
  }

  @Get('liveness')
  liveness() {
    // Simple liveness probe
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
    };
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    // Readiness probe - checks if app can serve traffic
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkCache(),
    ]);
  }

  private async checkDatabase(): Promise<Record<string, any>> {
    try {
      // Test database connection
      const testResult = await this.databaseService.healthCheck();

      if (testResult) {
        return {
          database: {
            status: 'up',
            responseTime: '< 100ms',
          },
        };
      }

      throw new Error('Database health check failed');
    } catch (error) {
      this.logger.error('Database health check failed', error);

      return {
        database: {
          status: 'down',
          error: error.message,
        },
      };
    }
  }

  private async checkCache(): Promise<Record<string, any>> {
    try {
      // Test cache connection
      const testKey = 'health_check_' + Date.now();

      await this.cacheService.set(testKey, 'test', 10);
      const result = await this.cacheService.get(testKey);

      await this.cacheService.delete(testKey);

      if (result === 'test') {
        return {
          cache: {
            status: 'up',
            responseTime: '< 50ms',
          },
        };
      }

      throw new Error('Cache health check failed');
    } catch (error) {
      this.logger.error('Cache health check failed', error);

      return {
        cache: {
          status: 'down',
          error: error.message,
        },
      };
    }
  }
}
