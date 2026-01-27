import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

import { Subject } from 'rxjs';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private shutdownListener$ = new Subject<void>();

  onApplicationShutdown(signal: string) {
    this.logger.log(`Received shutdown signal: ${signal}`);
    this.shutdownListener$.next();
  }

  subscribeToShutdown(callback: () => void): void {
    this.shutdownListener$.subscribe(() => {
      callback();
    });
  }

  async gracefulShutdown(server: any): Promise<void> {
    return new Promise((resolve) => {
      this.logger.log('Starting graceful shutdown...');

      // Stop accepting new connections
      server.close(() => {
        this.logger.log('HTTP server closed');

        // Give ongoing requests time to complete
        setTimeout(() => {
          this.logger.log('Graceful shutdown completed');
          resolve();
        }, 5000); // 5 seconds grace period
      });

      // Force close after timeout
      setTimeout(() => {
        this.logger.warn('Forcing shutdown after timeout');
        process.exit(1);
      }, 30000); // 30 seconds maximum
    });
  }
}
