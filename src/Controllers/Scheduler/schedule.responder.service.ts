import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  CONVERSATION_STATE_CLOSED_MESSAGE,
  DIALOG_TYPES,
} from 'src/constants/constants';
import { helper } from 'src/utils/HelperService';

import { CacheService } from '../Cache/cache.service';
import { ConnectorAPIService } from '../ConnectorAPI/connector-api.service';
import { DatabaseService } from '../Database/database.service';
import { SimulationConversation } from '../Simulation/simulation.dto';
import { SimulationService } from '../Simulation/simulation.service';

export const context = '[MessageResponderService]';

@Injectable()
export class MessageResponderService implements OnModuleInit {
  minWarmUpDelay: number;
  maxWarmUpDelay: number;
  maxAccountConcurrency: number;
  maxRegionConcurrency: number;
  dev_account: string[];
  restrictAccount: boolean;
  pause: boolean;
  isInitialised = false;

  constructor(
    @InjectPinoLogger(MessageResponderService.name)
    private readonly logger: PinoLogger,
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => SimulationService))
    private readonly simulationService: SimulationService,
    @Inject(forwardRef(() => ConnectorAPIService))
    private readonly connectorAPIService: ConnectorAPIService,
  ) {
    this.logger.setContext(context);

    this.pause = helper.toBoolean(
      this.configService.get<string>('PAUSE') || 'false',
    );

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
   * Checks if POST_SURVEY conversation has timed out
   */
  private async handlePostSurveyTimeout(
    conversation: SimulationConversation,
  ): Promise<boolean> {
    const { updatedAt, dialogType } = conversation;
    const now = Date.now();
    const twoMinutes = 1000 * 60 * 2;

    if (
      dialogType === DIALOG_TYPES.POST_SURVEY &&
      updatedAt &&
      updatedAt < now - twoMinutes
    ) {
      await this.connectorAPIService.closeConversation(
        conversation.accountId,
        conversation.consumerToken,
        conversation.id,
        conversation.dialogId,
      );

      return true;
    }

    return false;
  }

  /**
   * Validates conversation is ready for processing
   */
  private shouldProcessConversation(
    conversation: SimulationConversation,
  ): boolean {
    const { pendingConsumerRespondTime, pendingConsumer, agentMessages } =
      conversation;

    if (!pendingConsumerRespondTime || !pendingConsumer) {
      return false;
    }

    if (
      helper.lastValueInArray(agentMessages) ===
      CONVERSATION_STATE_CLOSED_MESSAGE
    ) {
      return false;
    }

    if (!agentMessages || agentMessages.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Retrieves and validates task for conversation
   */
  private async getConversationTask(
    conversation: SimulationConversation,
  ): Promise<any> {
    const task = await this.cache.getTask(
      conversation.accountId,
      conversation.requestId,
    );

    if (!task) {
      this.logger.warn({
        message: `No task found for requestId ${conversation.requestId}`,
        accountId: conversation.accountId,
        requestId: conversation.requestId,
        service: MessageResponderService.name,
        function: 'handleConversation',
      });
    }

    return task;
  }

  /**
   * Extracts trimmed message text and close flag
   */
  private extractMessageContent(messageText: string): {
    isClose: boolean;
    trimmedMessage: string;
  } {
    const isClose = messageText?.includes('::END_CONVERSATION') || false;
    const endMarker = '::END_CONVERSATION';

    const endIndex = messageText?.includes(endMarker)
      ? messageText.indexOf(endMarker)
      : messageText?.length || 0;

    const trimmedMessage = messageText
      ? messageText.substring(0, endIndex).trim()
      : '';

    return { isClose, trimmedMessage };
  }

  /**
   * Processes consumer response when timeout is reached
   */
  private async processConsumerResponse(
    conversation: SimulationConversation,
    task: any,
  ): Promise<void> {
    const agentMessage = conversation.agentMessages.join('\n');

    const message = await this.simulationService.getSyntheticConsumerMessage(
      task,
      conversation,
      agentMessage,
    );

    // remove pendingConsumerRespondTime, pendingConsumer = false

    await this.cache.updateConversation(
      conversation.accountId,
      conversation.id,
      {
        agentMessages: [],
      },
    );

    if (!message?.text) return;

    this.logger.warn({
      dialogtype: conversation.dialogType,
      dialogId: conversation.dialogId,
    });

    const { isClose, trimmedMessage } = this.extractMessageContent(
      message.text,
    );

    await this.connectorAPIService.publishConsumerMessage(
      conversation.accountId,
      conversation.consumerToken,
      trimmedMessage,
      conversation.id,
      conversation.dialogId,
    );

    if (isClose) {
      await this.connectorAPIService.closeConversation(
        conversation.accountId,
        conversation.consumerToken,
        conversation.id,
        conversation.dialogId,
      );
    }
  }

  async handleConversation(
    conversation: SimulationConversation,
  ): Promise<void> {
    try {
      // Handle POST_SURVEY timeout
      const postSurveyHandled =
        await this.handlePostSurveyTimeout(conversation);

      if (postSurveyHandled) return;

      // Validate conversation is ready for processing
      if (!this.shouldProcessConversation(conversation)) return;

      // Get and validate task
      const task = await this.getConversationTask(conversation);

      if (!task) return;

      // Process consumer response if timeout reached
      const { pendingConsumer, pendingConsumerRespondTime } = conversation;

      if (pendingConsumer && pendingConsumerRespondTime < Date.now()) {
        await this.processConsumerResponse(conversation, task);
      }
    } catch (error) {
      this.logger.error({
        message: `Error handling conversation ${conversation.id}`,
        error,
        accountId: conversation.accountId,
        requestId: conversation.requestId,
        service: MessageResponderService.name,
        function: 'handleConversation',
      });
    }
  }

  async messageResponderLoop() {
    try {
      const activeConversations = await this.cache.getAllActiveConversations();

      for (const conversation of activeConversations) {
        await this.handleConversation(conversation);
      }

      this.logger.info({
        message: `Message responder started for ${activeConversations.length} active conversations`,
        activeConversationsCount: activeConversations.length,
        service: MessageResponderService.name,
        function: 'messageResponder',
      });
    } catch (error) {
      this.logger.error({
        message: 'Error in message responder',
        error,
        service: MessageResponderService.name,
        function: 'messageResponder',
      });

      throw new InternalServerErrorException(
        `Error in message responder: ${error.message}`,
      );
    }
  }

  async onModuleInit() {
    if (this.pause) return;

    try {
      const databaseTasks = await this.databaseService.getAllRunningTasks();

      const tasks = (await this.cache.getAllTasks()).map(
        (task) => task.requestId,
      );

      // messageResponderLoop
      const tickIntervalMs =
        this.configService.get<number>('MESSAGE_RESPONDER_INTERVAL_MS') || 1000;

      const maxConversationConcurrency =
        this.configService.get<number>('MAX_CONVERSATION_CONCURRENCY') || 10;

      // graceful shutdown signal for this loop
      let stopLoop = false;

      const stopHandler = () => {
        stopLoop = true;

        this.logger.info({
          message: 'Message responder loop stopping due to shutdown signal',
          service: MessageResponderService.name,
          function: 'onModuleInit',
        });
      };

      process.once('SIGINT', stopHandler);
      process.once('SIGTERM', stopHandler);

      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

      // exponential backoff params
      const baseBackoff = 1000;
      const maxBackoff = 30_000;
      let backoffMs = 0;

      // start background loop (non-blocking)
      (async () => {
        this.logger.info({
          message: 'Starting message responder loop',
          tickIntervalMs,
          maxConversationConcurrency,
          service: MessageResponderService.name,
          function: 'messageResponderLoop',
        });

        while (!stopLoop && !this.pause) {
          const tickStart = Date.now();

          try {
            const activeConversations =
              await this.cache.getAllActiveConversations();

            if (activeConversations && activeConversations.length > 0) {
              // concurrency-limited processing using worker pool pattern
              let index = 0;

              const workerCount = Math.min(
                maxConversationConcurrency,
                activeConversations.length,
              );

              const workers = Array.from({ length: workerCount }).map(
                async () => {
                  while (!stopLoop) {
                    const index_ = index++;

                    if (index_ >= activeConversations.length) break;

                    const conv = activeConversations.at(index_);

                    if (!conv) continue;

                    try {
                      // handleConversation already has its own try/catch and safe guards
                      await this.handleConversation(conv);
                    } catch (error) {
                      this.logger.error({
                        message: `Error processing conversation ${conv?.id}`,
                        error: error,
                        accountId: conv?.accountId,
                        requestId: conv?.requestId,
                        service: MessageResponderService.name,
                        function: 'messageResponderLoop',
                      });
                    }
                  }
                },
              );

              await Promise.all(workers);
            }

            // successful tick -> clear backoff
            backoffMs = 1000;
          } catch (error) {
            // tick-level errors get backoff (exponential)
            backoffMs = backoffMs
              ? Math.min(maxBackoff, backoffMs * 2)
              : baseBackoff;

            this.logger.error({
              message: 'Unhandled error in message responder tick',
              error: error,
              backoffMs,
              service: MessageResponderService.name,
              function: 'messageResponderLoop',
            });
          }

          const took = Date.now() - tickStart;
          // if backoff is active, prefer backoff; otherwise sleep remaining tick interval
          const sleepMs = backoffMs || Math.max(0, tickIntervalMs - took);

          if (sleepMs > 0) {
            await sleep(sleepMs);
          }
        }

        this.logger.info({
          message: 'Message responder loop exited',
          service: MessageResponderService.name,
          function: 'messageResponderLoop',
        });

        // cleanup listeners
        process.removeListener('SIGINT', stopHandler);
        process.removeListener('SIGTERM', stopHandler);
      })().catch((error: unknown) => {
        // if the background loop catastrophically fails, log and don't crash the app here
        this.logger.error({
          message: 'Fatal error starting message responder loop',
          error: error,
          service: MessageResponderService.name,
          function: 'messageResponderLoop',
        });
      });

      for (const databaseTask of databaseTasks) {
        if (!tasks.includes(databaseTask.requestId)) {
          await this.cache.addTask(
            databaseTask.accountId,
            databaseTask.requestId,
            databaseTask,
          );
        }
      }

      this.logger.info({
        message: 'MessageResponderService module initialized successfully',
        detail: `Found ${tasks.length} tasks in the cache`,
        service: MessageResponderService.name,
        function: `[${MessageResponderService.name}]. onModuleInit`,
      });
    } catch (error) {
      this.logger.error({
        message: 'Error initializing MessageResponderService module',
        error,
        service: MessageResponderService.name,
        function: 'onModuleInit',
      });
    }

    this.isInitialised = true;
  }
}
