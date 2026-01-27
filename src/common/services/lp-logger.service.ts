import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

type LogLevel = 'debug' | 'error' | 'log' | 'verbose' | 'warn';

@Injectable()
export class LpLoggerService {
  private readonly owner = 'ets-convsim';
  private readonly service_name = 'ets-convsim-backend';

  constructor(private readonly logger: Logger) {}

  log(
    payload: Record<string, any> & { fn: string; message: string },
    level: LogLevel = 'log',
  ): void {
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const base = {
      fn: payload.fn,
      message: payload.message,
      timestamp: ts,
      lp_owner: this.owner,
      service_name: this.service_name,
    };

    const data = { ...payload, ...base };

    switch (level) {
      case 'debug':
        this.logger.debug(data);
        break;

      case 'error':
        this.logger.error(data);
        break;

      case 'verbose':
        this.logger.verbose(data);
        break;

      case 'warn':
        this.logger.warn(data);
        break;

      default:
        this.logger.log(data);
    }
  }
}
