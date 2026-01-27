import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { SIMULATION_STATUS } from 'src/constants/constants';

import { CacheService } from '../Cache/cache.service';
import { DatabaseService } from '../Database/database.service';
import { TaskStatus } from '../Simulation/simulation.dto';
import { SimulationService } from '../Simulation/simulation.service';

export const context = '[QueuingService]';

@Injectable()
export class QueuingService implements OnModuleInit {
  minWarmUpDelay: number;
  maxWarmUpDelay: number;
  maxAccountConcurrency: number;
  maxRegionConcurrency: number;
  dev_account: string[];
  restrictAccount: boolean;
  isInitialised = false;

  constructor(
    @InjectPinoLogger(QueuingService.name)
    private readonly logger: PinoLogger,
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => SimulationService))
    private readonly simulationService: SimulationService,
  ) {
    this.logger.setContext(context);

    this.maxRegionConcurrency =
      this.configService.get<number>('MAX_REGION_CONCURRENCY') || 5000;

    this.maxAccountConcurrency =
      this.configService.get<number>('MAX_ACCOUNT_CONCURRENCY') || 5000;

    this.maxWarmUpDelay = this.minWarmUpDelay =
      this.configService.get<number>('MIN_WARM_UP_DELAY') || 5000;

    this.maxWarmUpDelay =
      this.configService.get<number>('MAX_WARM_UP_DELAY') || 5000;

    const da =
      this.configService.get<string>('DEVELOPER_ACCOUNT_ID') || '31487986';

    this.dev_account = da.includes(',') ? da.split(',') : [da];

    this.restrictAccount =
      this.configService.get<boolean>('RESTRICT_ACCOUNT') || false;
  }
  /**
   *
   * @param task
   * @returns void
   * Adds additional conversations to the global queue which will be processed by globalQueueProcessing.
   */
  async nextAction(task: TaskStatus) {
    if (task.status === SIMULATION_STATUS.IN_PROGRESS) {
      const {
        maxConversations,
        completedConversations,
        inFlightConversations,
        concurrentConversations,
      } = task;

      const remainingConversations =
        maxConversations - (completedConversations + inFlightConversations);

      if (remainingConversations <= 0) {
        // conclude task
        return;
      }

      const additionalConversations = Math.min(
        remainingConversations,
        concurrentConversations - inFlightConversations,
      );

      if (additionalConversations > 0) {
        await this.cache.addToQueuedConversations(
          task.accountId,
          task.requestId,
          additionalConversations,
        );
      }
    }
  }

  async startQueuing() {
    const tasks = await this.cache.getAllTasks();

    for (const task of tasks) {
      this.nextAction(task);
    }
  }

  async onModuleInit() {
    try {
      this.logger.info({
        message: 'QueuingService module initialized',
        service: QueuingService.name,
        function: 'onModuleInit',
        dev_account: this.dev_account,
        restrictAccount: this.restrictAccount,
      });

      /**
       * Restore tasks from the database to the cache that are missing in the cache
       */
      const databaseTasks = await this.databaseService.getAllRunningTasks();

      const tasks = (await this.cache.getAllTasks()).map(
        (task) => task.requestId,
      );

      for (const databaseTask of databaseTasks) {
        if (!tasks.includes(databaseTask.requestId)) {
          await this.cache.addTask(
            databaseTask.accountId,
            databaseTask.requestId,
            databaseTask,
          );
        }
      }
    } catch (error) {
      this.logger.error({
        message: 'Error initializing QueuingService module',
        error,
        service: QueuingService.name,
        function: 'onModuleInit',
      });
    }

    this.isInitialised = true;
  }
}
