import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { uuid } from 'short-uuid';

import {
  CONVERSATION_SIMULATION_STATES,
  CONVERSATION_STATE,
  SIMULATION_STATUS,
  SYNTHETIC_CUSTOMER_SOURCE,
} from 'src/constants/constants';
import { helper } from 'src/utils/HelperService';

import { AIStudioService } from '../AIStudio/ai-studio.service';
import { CacheService } from '../Cache/cache.service';
import { AppConfigurationService } from '../Configuration/configuration.service';
import { ConnectorAPIService } from '../ConnectorAPI/connector-api.service';
import { ConversationCloudService } from '../ConversationalCloud/conversation-cloud.service';
import { DatabaseService } from '../Database/database.service';
import { AppUserDto } from '../users/users.dto';

import { AIStudioConversationHandler } from './handlers/ai-studio-conversation.handler';
import { IConversationHandler } from './handlers/conversation-handler.interface';
import { InternalConversationHandler } from './handlers/internal-conversation.handler';
import {
  IntialRequest,
  SimulationConversation,
  TaskRequestDto,
  TaskStatus,
} from './simulation.dto';

const context_ = helper.ctx.bind(helper);
const fillPrompt = helper.fillPrompt.bind(helper);
const insertCCBearer = helper.insertCCBearer.bind(helper);

export const context = '[SimulationService]';

@Injectable()
export class SimulationService {
  private conversationCreationLocks = new Map<string, Promise<TaskStatus>>();
  private conversationHandlers: Map<
    SYNTHETIC_CUSTOMER_SOURCE,
    IConversationHandler
  >;

  constructor(
    @InjectPinoLogger(SimulationService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => AppConfigurationService))
    private readonly appConfigService: AppConfigurationService,
    @Inject(forwardRef(() => ConnectorAPIService))
    private readonly connectorAPI: ConnectorAPIService,
    private readonly aiStudioService: AIStudioService,
    private readonly databaseService: DatabaseService,
    private readonly conversationCloudService: ConversationCloudService,
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => AIStudioConversationHandler))
    private readonly aiStudioHandler: AIStudioConversationHandler,
    private readonly internalHandler: InternalConversationHandler,
  ) {
    this.logger.setContext(context);

    // Initialize conversation handlers map
    this.conversationHandlers = new Map();

    this.conversationHandlers.set(
      SYNTHETIC_CUSTOMER_SOURCE.AI_STUDIO,
      this.aiStudioHandler,
    );

    this.conversationHandlers.set(
      SYNTHETIC_CUSTOMER_SOURCE.CONVERSATION_SIMULATOR,
      this.internalHandler,
    );
  }

  /**
   * Creates and initializes a new simulation task for synthetic customer conversations.
   *
   * This method performs comprehensive setup including service worker validation,
   * prompt caching, task deduplication, and conversation initialization. It ensures
   * system readiness before launching simulated customer interactions.
   *
   * @param task - The task request configuration containing simulation parameters
   * @param accountId - The LivePerson account identifier for the simulation
   * @param user - The authenticated user requesting the simulation task
   *
   * @returns Promise<any> A sanitized task status object (with sensitive data removed)
   *
   * @throws {InternalServerErrorException} When user validation fails
   * @throws {InternalServerErrorException} When service worker is not running
   * @throws {InternalServerErrorException} When task creation encounters system errors
   *
   * @example
   * ```typescript
   * const task = {
   *   maxConversations: 10,
   *   concurrentConversations: 3,
   *   flowId: 'customer-support-flow',
   *   personas: ['technical-customer', 'billing-customer'],
   *   scenarios: ['product-inquiry', 'complaint-resolution']
   * };
   * const result = await simulationService.createTask(task, 'account123', user);
   * ```
   *
   * @remarks
   * - Validates service worker availability before task creation
   * - Implements task deduplication to prevent concurrent tasks per user
   * - Caches prompts for efficient access during conversation simulation
   * - Enforces maximum conversation limits for resource management
   * - Automatically cleans up any existing user tasks before creating new ones
   * - Returns sanitized task data with authentication tokens removed for security
   */
  async createTask(
    task: TaskRequestDto,
    accountId: string,
    user: AppUserDto,
  ): Promise<any> {
    const function_ = 'requestTaskSyntheticConsumers';

    if (!user?.id) {
      throw new InternalServerErrorException('No user found');
    }

    const workerRunning =
      await this.appConfigService.testServiceWorker(accountId);

    if (workerRunning?.status !== 'success') {
      this.logger.error({
        fn: function_,
        message: `Service worker is not running for account ${accountId}`,
        accountId,
      });

      throw new InternalServerErrorException('Service worker is not running');
    }

    const {
      maxConversations = 1,
      concurrentConversations = 1,
      flowId,
      categories,
      prompts,
      personas,
      identities,
      scenarios,
    } = task;

    /**
     * Get prompts from DB and set in cache with key `prompt_${accountId}:${promptId}`
     */
    await this.appConfigService.getTaskPrompts(accountId, prompts);

    /*
     * check if existing (running) task is already running for same account and user
     */
    const existingTask =
      (await this.databaseService.canCreateNewTask(
        accountId,
        String(user.id),
      )) || null;

    if (existingTask) {
      return existingTask;
    }

    const configurationValidationCheck =
      await this.databaseService.validateTaskConfiguration(
        accountId,
        categories,
        identities || [],
        personas || [],
        scenarios || [],
        prompts ? Object.values(prompts) : [],
      );

    const { criticalError, errors } = configurationValidationCheck;

    if (criticalError) {
      throw new BadRequestException(
        'Invalid task configuration, review your simulation configuration and resolve any issues before retrying. Errors: ' +
          (errors?.length ? errors.join(', ') : 'Unknown validation errors'),
      );
    }

    /* ensure that any existing conversations related to the user's previous task are closed */
    await this.stopAllTasksAndConversationsForUser(
      accountId,
      String(user.id),
      false,
    );

    const taskName = helper.createTaskName(user);
    const requestId = `task_${accountId}_${uuid()}`;

    const maxConversationLimit =
      this.configService.get<number>('MAX_CONVERSATIONS_LIMIT') || 20;

    await this.cache.setMaxConversationLimit(
      requestId,
      Math.min(maxConversations, maxConversationLimit),
    );

    const taskStatus: TaskStatus = new IntialRequest(
      Object.assign({}, task, {
        taskName,
        requestId,
        userId: user.id,
        status: SIMULATION_STATUS.IN_PROGRESS,
        inFlightConversations: 0,
        flowId,
        skillId: task.skillId || -1,
        source: task.source,
        personas,
        identities,
        scenarios,
      }),
    );

    // Create a plain object copy of the class instance to avoid losing the prototype when spreading
    const plainTaskStatus = JSON.parse(JSON.stringify(taskStatus));

    await this.databaseService.addTask(accountId, plainTaskStatus);

    const maxToQueue = this.configService.get<number>('MAX_QUEUING') || 5;
    const conversationsToQueue = Math.min(maxToQueue, concurrentConversations);

    // Await the first simulation to validate everything works before returning success
    void this.processNextSimulations(taskStatus, conversationsToQueue);

    // Get the updated task status after processing
    const updatedTask = await this.databaseService.getTask(
      accountId,
      requestId,
    );

    const index = JSON.parse(JSON.stringify(updatedTask || taskStatus));

    delete index.token;

    return index;
  }

  /**
   * Performs comprehensive cleanup by stopping all active tasks and conversations for a specific user.
   *
   * This critical cleanup method ensures system consistency by gracefully terminating all ongoing
   * simulation activities for a user. It handles both cached and database-stored tasks, properly
   * closes conversations, and prevents resource leaks during task transitions or error scenarios.
   *
   * @param accountId - The LivePerson account identifier for scoping the cleanup operation
   * @param userId - The user ID whose tasks should be stopped, or null for system-wide operations
   * @param isError - Optional flag indicating if cleanup is due to an error condition (affects final status)
   *
   * @returns Promise<TaskStatus | null> The last task that was stopped, or null if no tasks were active
   *
   * @throws {InternalServerErrorException} When critical cleanup operations fail
   *
   * @remarks
   * - Retrieves tasks from both cache and database to ensure complete coverage
   * - Merges and deduplicates conversations from multiple sources
   * - Gracefully closes open conversations through the ConnectorAPI service
   * - Updates task status to CANCELLED or ERROR based on cleanup reason
   * - Removes sensitive authentication data (JWT tokens) during cleanup
   * - Maintains data consistency between cache and database layers
   * - Handles concurrent conversation termination for performance
   * - Preserves completed tasks' status during cleanup operations
   */
  async stopAllTasksAndConversationsForUser(
    accountId: string,
    userId: string | null,
    isError?: boolean,
  ): Promise<TaskStatus | null> {
    const function_ = 'stopAllTasksAndConversationsForUser';

    try {
      const user = userId || 'system';

      const allCachedRunningTasks = await this.cache.getActiveTasksByUserId(
        accountId,
        userId,
      );

      const _allTasks = await this.databaseService.getRunningTasksByUser(
        accountId,
        userId,
      );

      const allTasks = allCachedRunningTasks.concat(_allTasks);
      let toReturn: TaskStatus | null = null;
      const databaseConversationsToClose = [];

      // Stop all tasks and collect conversations to close
      for (const t of allTasks) {
        const taskStatus = t;

        if (!taskStatus) {
          continue;
        }

        this.logger.info({
          fn: function_,
          message: `Stopping task for account ${accountId}, requestId ${taskStatus.requestId}`,
          accountId,
        });

        const databaseConversations =
          await this.databaseService.getConversationsByTaskId(
            accountId,
            taskStatus.requestId,
          );

        databaseConversations.forEach((c) => {
          if (c.status === CONVERSATION_STATE.CLOSE) return;
          databaseConversationsToClose.push(c);
        });

        toReturn = taskStatus;

        await this.updateTaskStatusForStop(accountId, taskStatus, isError);
      }

      // Get all conversations to close
      const cachedConversations = await this.cache.getConversationsByUserId(
        accountId,
        userId,
      );

      const openConversations = this.getUniqueOpenConversations(
        cachedConversations,
        databaseConversationsToClose,
      );

      this.logger.info({
        fn: function_,
        message: `Closing ${openConversations.length} open conversations for account ${accountId}`,
        accountId,
        user,
      });

      // Close all open conversations
      await this.closeConversations(
        accountId,
        openConversations,
        function_,
        user,
      );

      return toReturn;
    } catch (error) {
      this.logger.error({
        fn: 'stopAllSyntheticConversations',
        message: `Error stopping all synthetic conversations for account ${accountId}: ${error}`,
        accountId,
      });

      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Updates task status when stopping it, removing sensitive data and updating database
   */
  private async updateTaskStatusForStop(
    accountId: string,
    taskStatus: TaskStatus,
    isError?: boolean,
  ): Promise<void> {
    const requestId = taskStatus.requestId;

    const newStatus = isError
      ? SIMULATION_STATUS.ERROR
      : SIMULATION_STATUS.CANCELLED;

    taskStatus.status =
      taskStatus.status === SIMULATION_STATUS.COMPLETED
        ? SIMULATION_STATUS.COMPLETED
        : newStatus;

    taskStatus.inFlightConversations = 0;
    delete taskStatus.appJwt;
    delete taskStatus.token;

    await this.databaseService.updateTask(
      accountId,
      requestId,
      {
        updatedAt: Date.now(),
        status: newStatus,
        inFlightConversations: 0,
      },
      ['appJwt', 'consumerToken', 'token'],
    );

    this.cache.deleteTask(accountId, taskStatus.requestId);
  }

  /**
   * Merges and deduplicates conversations from multiple sources, returning only open ones
   */
  private getUniqueOpenConversations(
    cachedConversations: any[],
    databaseConversations: any[],
  ): any[] {
    const allConversations = cachedConversations.concat(databaseConversations);
    const uniqueOpenConversationsMap = new Map<string, any>();

    for (const conversation of allConversations || []) {
      if (
        conversation.status === CONVERSATION_STATE.OPEN &&
        !uniqueOpenConversationsMap.has(conversation.id)
      ) {
        uniqueOpenConversationsMap.set(conversation.id, conversation);
      }
    }

    return Array.from(uniqueOpenConversationsMap.values());
  }

  /**
   * Closes all provided conversations and updates their status in database and cache
   */
  private async closeConversations(
    accountId: string,
    conversations: any[],
    functionName: string,
    user: string,
  ): Promise<void> {
    for (const conversation of conversations) {
      if (conversation.status === CONVERSATION_STATE.CLOSE) continue;

      const closed = await this.connectorAPI.closeConversation(
        accountId,
        conversation.consumerToken,
        conversation.id,
      );

      if (!closed) {
        this.logger.error({
          fn: functionName,
          message: `Error closing conversation ${conversation.id}`,
          accountId,
          user,
        });
      }

      await this.databaseService.updateConversation(
        accountId,
        conversation.id,
        {
          state: CONVERSATION_SIMULATION_STATES.COMPLETED,
          status: CONVERSATION_STATE.CLOSE,
          active: false,
        },
      );

      await this.cache.removeConversation(accountId, conversation.id);
    }
  }

  /**
   * Orchestrates the next batch of simulation conversations with concurrency control and task validation.
   *
   * This method serves as the main coordinator for conversation simulation flow, implementing
   * sophisticated locking mechanisms to prevent race conditions while managing the queue of
   * synthetic customer conversations that need to be initiated.
   *
   * @param task - The current task status containing simulation configuration and progress
   * @param conversationsToQueue - The number of new conversations to initiate in this batch
   *
   * @returns Promise<TaskStatus> Updated task status reflecting the current simulation state
   *
   * @throws {InternalServerErrorException} When critical task validation or execution fails
   *
   * @example
   * ```typescript
   * const updatedTask = await simulationService.processNextSimulations(currentTask, 5);
   * console.log(`In-flight conversations: ${updatedTask.inFlightConversations}`);
   * ```
   *
   * @remarks
   * - Implements distributed locking to prevent concurrent conversation creation for same task
   * - Validates task state before processing to ensure simulation is still active
   * - Delegates actual execution to internal method while managing lock lifecycle
   * - Returns cached task state if processing is already in progress
   * - Automatically releases locks upon completion or failure
   * - Critical for maintaining conversation quotas and preventing resource exhaustion
   */
  async processNextSimulations(
    task: TaskStatus,
    conversationsToQueue: number,
  ): Promise<TaskStatus> {
    const function_ = 'processNextSimulations';
    const { requestId, accountId } = task;

    // Create lock to prevent concurrent conversation creation for the same task
    const lockKey = `processSimulations_${requestId}`;

    if (this.conversationCreationLocks.has(lockKey)) {
      this.logger.debug({
        fn: function_,
        message: `Conversation creation already in progress for task ${requestId}`,
        accountId,
        requestId,
      });

      return await this.cache.getTask(accountId, requestId);
    }

    const creationPromise = this._executeProcessNextSimulations(
      task,
      conversationsToQueue,
    );

    this.conversationCreationLocks.set(lockKey, creationPromise);

    try {
      return await creationPromise;
    } finally {
      this.conversationCreationLocks.delete(lockKey);
    }
  }

  /**
   * Validates task progress and returns the actual number of conversations to queue
   */
  private async validateAndGetConversationsToQueue(
    task: TaskStatus,
    conversationsToQueue: number,
    functionName: string,
  ): Promise<number | null> {
    const { requestId, accountId, status } = task;

    if (status !== SIMULATION_STATUS.IN_PROGRESS) {
      this.logger.warn({
        fn: functionName,
        message: `Task is not in progress for account ${accountId}, status: ${status}`,
        accountId,
        requestId,
      });

      return null;
    }

    if (!requestId || !accountId) {
      throw new InternalServerErrorException(
        ...context_(context, functionName, `Missing requestId or accountId`),
      );
    }

    const currentProgress = await this.connectorAPI.getTaskProgress(task);

    if (!currentProgress || currentProgress.conversationsToQueue <= 0) {
      this.logger.debug({
        fn: functionName,
        message: `No conversations to queue for task ${requestId}`,
        accountId,
        requestId,
        progress: currentProgress,
      });

      return null;
    }

    return Math.min(conversationsToQueue, currentProgress.conversationsToQueue);
  }

  /**
   * Creates a single conversation and handles errors
   */
  private async createSingleConversation(
    accountId: string,
    requestId: string,
    index: number,
    functionName: string,
  ): Promise<string | null> {
    const freshTask = await this.databaseService.getTask(accountId, requestId);

    if (!freshTask || freshTask.status !== SIMULATION_STATUS.IN_PROGRESS) {
      this.logger.warn({
        fn: functionName,
        message: `Task status changed during conversation creation, stopping`,
        accountId,
        requestId,
        currentStatus: freshTask?.status,
      });

      return null;
    }

    const conversationId =
      await this.createSyntheticConsumerConversation(freshTask);

    if (!conversationId) {
      this.logger.error({
        fn: functionName,
        message: `Failed to create conversation ${index + 1} for task ${requestId}`,
        accountId,
        requestId,
      });

      throw new InternalServerErrorException('Failed to create conversation');
    }

    return conversationId;
  }

  /**
   * Handles abandonment when no conversations were created successfully
   */
  private async handleConversationCreationFailure(
    task: TaskStatus,
    error: any,
    functionName: string,
  ): Promise<never> {
    const { accountId, requestId } = task;

    this.logger.warn({
      fn: functionName,
      message: `No conversations created successfully, abandoning task`,
      accountId,
      requestId,
    });

    await this.abandonTask(task);

    const updatedTask = await this.databaseService.getTask(
      accountId,
      requestId,
    );

    this.logger.info({
      fn: functionName,
      message: `Task abandoned with status: ${updatedTask?.status}`,
      accountId,
      requestId,
      status: updatedTask?.status,
    });

    throw new InternalServerErrorException(
      ...context_(
        context,
        functionName,
        `Failed to create any conversations for task ${requestId}: ${error.message || error}`,
      ),
    );
  }

  private async _executeProcessNextSimulations(
    task: TaskStatus,
    conversationsToQueue: number,
  ): Promise<TaskStatus> {
    const function_ = '_executeProcessNextSimulations';
    const { requestId, accountId } = task;

    try {
      const actualConversationsToQueue =
        await this.validateAndGetConversationsToQueue(
          task,
          conversationsToQueue,
          function_,
        );

      if (
        actualConversationsToQueue === null ||
        actualConversationsToQueue <= 0
      ) {
        return await this.cache.getTask(accountId, requestId);
      }

      let successfullyCreated = 0;

      for (let index = 0; index < actualConversationsToQueue; index++) {
        try {
          const conversationId = await this.createSingleConversation(
            accountId,
            requestId,
            index,
            function_,
          );

          if (!conversationId) {
            break;
          }

          successfullyCreated++;

          // Small delay between creations to prevent overwhelming the system
          if (index < actualConversationsToQueue - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          this.logger.error({
            fn: function_,
            message: `Error creating conversation ${index + 1} for task ${requestId}`,
            error,
            accountId,
            requestId,
            successfullyCreated,
          });

          if (successfullyCreated === 0) {
            await this.handleConversationCreationFailure(
              task,
              error,
              function_,
            );
          }

          break;
        }
      }

      this.logger.debug({
        fn: function_,
        message: `Successfully created ${successfullyCreated} of ${actualConversationsToQueue} conversations`,
        accountId,
        requestId,
      });

      return await this.cache.getTask(accountId, requestId);
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error processing next simulation`,
        requestId: task.requestId,
        accountId: task.accountId,
        error,
      });

      throw error;
    }
  }

  async abandonTask(task: TaskStatus) {
    const function_ = 'abandonTask';

    try {
      const { accountId, createdBy } = task;

      return await this.stopAllTasksAndConversationsForUser(
        accountId,
        String(createdBy),
        true,
      );
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: 'Error abandoning task',
        requestId: task.requestId,
        accountId: task.accountId,
      });

      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Gets the appropriate conversation handler for the given source type
   */
  private getConversationHandler(
    source?: SYNTHETIC_CUSTOMER_SOURCE,
  ): IConversationHandler {
    // Default to CONVERSATION_SIMULATOR if no source is specified
    const effectiveSource =
      source || SYNTHETIC_CUSTOMER_SOURCE.CONVERSATION_SIMULATOR;

    const handler = this.conversationHandlers.get(effectiveSource);

    if (!handler) {
      throw new InternalServerErrorException(
        `No conversation handler found for source: ${effectiveSource}`,
      );
    }

    return handler;
  }

  /**
   * Creates and initializes a new synthetic consumer conversation within the LivePerson ecosystem.
   *
   * This method orchestrates the complete conversation creation process including consumer authentication,
   * persona/scenario selection, conversation routing, and initial message generation. It serves as the
   * entry point for synthetic customer interactions with the contact center.
   *
   * @param task - The simulation task containing configuration and authentication details
   *
   * @returns Promise<string> | null The conversation ID if successful, or null if creation failed
   *
   * @throws {InternalServerErrorException} When personas or scenarios are missing for non-AI Studio sources
   * @throws {InternalServerErrorException} When authentication tokens cannot be obtained
   * @throws {InternalServerErrorException} When conversation creation encounters system failures
   *
   * @example
   * ```typescript
   * const conversationId = await simulationService.createSyntheticConsumerConversation(taskStatus);
   * if (conversationId) {
   *   console.log(`Created conversation: ${conversationId}`);
   * }
   * ```
   *
   * @remarks
   * - Validates persona and scenario availability based on simulation source type
   * - Obtains consumer authentication tokens through ConnectorAPI
   * - Randomly selects personas and scenarios for conversation diversity
   * - Handles different conversation creation flows (AI Studio vs. traditional simulation)
   * - Generates realistic consumer names and profile information
   * - Routes conversations to appropriate skills based on configuration
   * - Initiates conversation with AI-generated opening message
   * - Tracks conversation metadata for analysis and monitoring
   * - Implements proper error handling for authentication and routing failures
   */
  /**
   * Creates and initializes a new synthetic consumer conversation within the LivePerson ecosystem.
   *
   * This method now uses the handler pattern to delegate conversation creation to the appropriate
   * handler based on the task's source type (AI Studio vs Internal simulation).
   *
   * @param task - The simulation task containing configuration and authentication details
   *
   * @returns Promise<string> | null The conversation ID if successful, or null if creation failed
   */
  async createSyntheticConsumerConversation(
    task: TaskStatus,
  ): Promise<string> | null {
    const function_ = 'createSyntheticConsumerConversation';

    if (!task?.accountId) {
      this.logger.error({
        fn: function_,
        message: `No task or accountId found`,
        task,
      });

      return null;
    }

    const { source } = task;

    const effectiveSource =
      source || SYNTHETIC_CUSTOMER_SOURCE.CONVERSATION_SIMULATOR;

    this.logger.info({
      fn: function_,
      message: `Creating synthetic consumer conversation for account ${task.accountId}`,
      accountId: task.accountId,
      requestId: task.requestId,
      originalSource: source,
      effectiveSource,
    });

    try {
      // Get the appropriate handler for this source type
      const handler = this.getConversationHandler(source);

      // Delegate conversation creation to the handler
      return await handler.createConversation(task);
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error creating synthetic consumer conversation: ${error.message || error}`,
        accountId: task.accountId,
        requestId: task.requestId,
        source,
        error,
      });

      // If error has response data (e.g., from APIService), preserve and re-throw it
      if (error.response) {
        throw error;
      }

      // Otherwise throw with meaningful message
      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `Error creating synthetic consumer conversation: ${error.message || error}`,
        ),
      );
    }
  }

  /**
   * Sends ad-hoc messages during active simulations to influence conversation flow.
   *
   * This method enables manual intervention in ongoing conversations by allowing operators
   * to send "nudge" messages to synthetic consumers or provide context to agents. It supports
   * real-time conversation manipulation for testing scenarios and training purposes.
   *
   * @param accountId - The LivePerson account identifier for message routing
   * @param conversationId - The specific conversation to inject the message into
   * @param body - Message configuration object containing content and target details
   * @param body.requestId - Optional task request ID for context tracking
   * @param body.message.message - The text content to send in the conversation
   * @param body.message.target - The intended recipient ('consumer' or 'agent')
   *
   * @returns Promise<any> Result of the message sending operation
   *
   * @throws {InternalServerErrorException} When conversation lookup or message delivery fails
   * @throws {BadRequestException} When message target is invalid or conversation is inactive
   *
   * @example
   * ```typescript
   * // Send a nudge to make the consumer more assertive
   * await simulationService.sendMessage('account123', 'conv456', {
   *   requestId: 'task789',
   *   message: {
   *     message: 'Please be more insistent about your refund request',
   *     target: 'consumer'
   *   }
   * });
   *
   * // Provide context to the agent
   * await simulationService.sendMessage('account123', 'conv456', {
   *   message: {
   *     message: 'This customer has been escalated from previous interactions',
   *     target: 'agent'
   *   }
   * });
   * ```
   *
   * @remarks
   * - Supports bidirectional message injection (to both consumers and agents)
   * - Maintains conversation context and flow continuity
   * - Enables real-time simulation adjustment and testing
   * - Consumer messages trigger AI response generation for continued interaction
   * - Agent messages provide contextual information without breaking conversation flow
   * - Validates conversation existence and active status before message delivery
   * - Tracks message injection for simulation analysis and debugging
   * - Handles different message types (text, structured content, etc.)
   */
  async sendMessage(
    accountId: string,
    conversationId: string,
    body: {
      message: {
        message: string;
        target: string;
      };
      requestId?: string;
    },
  ): Promise<SimulationConversation | null> {
    const function_ = 'sendMessage';

    try {
      const { message } = body.message;

      const conversation = await this.cache.getConversation(
        accountId,
        conversationId,
      );

      if (!conversation) {
        this.logger.error({
          fn: function_,
          message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const { requestId } = conversation || {};

      const task = await this.cache.getTask(
        accountId,
        requestId || body.requestId,
      );

      if (!task || task.status !== SIMULATION_STATUS.IN_PROGRESS) {
        this.logger.error({
          fn: function_,
          message: `No task found for account ${accountId} and requestId ${requestId}`,
          accountId,
          requestId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No task found for account ${accountId} and requestId ${requestId}`,
          ),
        );
      }

      if (!task) {
        this.logger.error({
          fn: function_,
          message: `No task found for account ${accountId} and requestId ${requestId}`,
          accountId,
          requestId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No task found for account ${accountId} and requestId ${requestId}`,
          ),
        );
      }

      if (!conversation.consumerToken) {
        this.logger.error({
          fn: function_,
          message: `No consumerToken for conversation ${conversationId} for account ${accountId}`,
          accountId,
          requestId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No token found for account ${accountId} and requestId ${requestId}`,
          ),
        );
      }

      if (body.message.target === 'agent') {
        const appJwt = await this.connectorAPI.getAppJwt(accountId);

        if (!appJwt) {
          throw new InternalServerErrorException(
            `AppJwt not found for account: ${accountId}`,
          );
        }

        await this.connectorAPI.publishConsumerMessage(
          accountId,
          conversation.consumerToken,
          message,
          conversationId,
          conversation.dialogId,
        );

        return conversation;
      }

      const token = await this.appConfigService.getTokenWithFallback(
        task.accountId,
      );

      if (!token) {
        this.logger.error({
          fn: function_,
          message: `No token found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No token found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const lastAgentMessageTime = helper.getLastAgentMessageTime(conversation);
      const toSend = `${message}\n(last agent message time: ${lastAgentMessageTime})`;
      // Use the appropriate handler to generate the message
      const handler = this.getConversationHandler(task.source);

      const response = await handler.generateMessage(
        task,
        conversation,
        toSend,
      );

      await this.cache.updateConversation(accountId, conversationId, {
        customerTurns: conversation.customerTurns + 1,
      });

      if (!response) {
        this.logger.error({
          fn: function_,
          message: `Error sending message to conversation ${conversationId} for account ${accountId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `Error sending message to conversation ${conversationId} for account ${accountId}`,
          ),
        );
      }

      const appJwt = await this.connectorAPI.getAppJwt(accountId);

      if (!appJwt) {
        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `AppJwt not found for account: ${accountId}`,
          ),
        );
      }

      await this.connectorAPI.publishConsumerMessage(
        accountId,
        conversation.consumerToken,
        response.text,
        conversationId,
        conversation.dialogId,
      );

      return conversation;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error sending message to conversation ${conversationId} for account ${accountId}`,
        accountId,
        conversationId,
        error,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, `Error sending message`, accountId),
      );
    }
  }

  /**
   * Generates synthetic consumer messages using the appropriate handler based on task source.
   *
   * This method now delegates message generation to the appropriate handler while maintaining
   * the same error handling logic for LLM content policy violations.
   *
   * @param task - The simulation task containing configuration and context
   * @param conversation - The conversation object with flow and AI Studio details
   * @param message - The input message or continuation prompt
   *
   * @returns Promise<{text: string, speaker: string, time: number, id: string}> Generated consumer message with metadata
   */
  async getSyntheticConsumerMessage(
    task: TaskStatus,
    conversation: Partial<SimulationConversation>,
    message: string,
  ): Promise<{
    id: string;
    speaker: string;
    text: string;
    time: number;
  }> {
    const function_ = 'getSyntheticConsumerMessage';

    try {
      // Get the appropriate handler for this task's source type
      const handler = this.getConversationHandler(task.source);

      const response = await handler.generateMessage(
        task,
        conversation,
        message,
      );

      if (!response?.text) {
        this.logger.error({
          fn: function_,
          message: `No response received from handler for account ${conversation.accountId} and conversationId ${conversation.id}`,
          accountId: conversation.accountId,
          conversationId: conversation.id,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            'No response received from handler',
            conversation.accountId,
          ),
        );
      }

      return response;
    } catch (error) {
      // Check if this is an LLM content policy violation
      const isContentPolicyViolation =
        error?.response?.data?.errorMessage?.includes(
          'content management policy',
        ) || error?.response?.data?.errorMessage?.includes('content filter');

      this.logger.debug({
        fn: function_,
        message: 'Error caught in getSyntheticConsumerMessage',
        accountId: conversation.accountId,
        conversationId: conversation.id,
        isContentPolicyViolation,
        errorType: error?.name,
        hasResponse: !!error?.response,
        hasErrorMessage: !!error?.response?.data?.errorMessage,
      });

      if (isContentPolicyViolation) {
        // openai / ai studio error - handle content policy violations
        // Send placeholder message to agent
        await this.connectorAPI.publishConsumerMessage(
          conversation.accountId,
          conversation.consumerToken,
          '...',
          conversation.id,
        );

        // Update error count and reset conversation state to prevent retry loops
        const newErrorCount = (conversation.llmErrorCount ?? 0) + 1;

        await this.cache.updateConversation(
          conversation.accountId,
          conversation.id,
          {
            llmErrorCount: newErrorCount,
            agentMessages: [], // Clear agent messages to prevent scheduler from retrying
            pendingConsumer: false, // Reset pending state
            pendingConsumerRespondTime: null, // Clear pending timeout
          },
        );

        // Check if error count threshold exceeded (>= 3 strikes)
        if (newErrorCount >= 3) {
          this.logger.error({
            fn: function_,
            message: `LLM error count exceeded (${newErrorCount}) for conversation ${conversation.id} for account ${conversation.accountId}`,
            accountId: conversation.accountId,
            conversationId: conversation.id,
            errorCount: newErrorCount,
          });

          await this.connectorAPI.closeConversation(
            conversation.accountId,
            conversation.consumerToken,
            conversation.id,
          );

          throw new InternalServerErrorException(
            ...context_(
              context,
              function_,
              `LLM error count exceeded (${newErrorCount}/3), conversation closed`,
              conversation.accountId,
            ),
          );
        }

        this.logger.warn({
          fn: function_,
          message: `LLM content filter triggered (${newErrorCount}/3 strikes) for conversation ${conversation.id}, retrying with fallback message`,
          accountId: conversation.accountId,
          conversationId: conversation.id,
          errorCount: newErrorCount,
          originalMessage: message,
        });

        // Fetch fresh conversation with updated error count
        const freshConversation = await this.cache.getConversation(
          conversation.accountId,
          conversation.id,
        );

        if (!freshConversation) {
          throw new InternalServerErrorException(
            ...context_(
              context,
              function_,
              'Conversation not found in cache during LLM error recovery',
              conversation.accountId,
            ),
          );
        }

        // Retry with a neutral fallback message that won't trigger content filters
        // Use very simple, neutral language to avoid triggering Azure's content policy
        const fallbackMessage = `The agent sent an unclear message. Please respond naturally showing confusion about what they said, such as "I'm sorry, I don't understand what you mean by that" or "That's a strange thing to say, can we get back to my issue?"`;

        return await this.getSyntheticConsumerMessage(
          task,
          freshConversation,
          fallbackMessage,
        );
      }

      this.logger.error({
        fn: function_,
        message: `Error sending synthetic consumer message: ${error}`,
        error,
        agentmessage: message,
        accountId: conversation.accountId,
        conversationId: conversation.id,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          'Error sending synthetic consumer message',
          error,
        ),
      );
    }
  }

  async concludeConversation(
    accountId: string,
    conversationId: string,
    requestId: string,
  ): Promise<SimulationConversation | undefined> {
    const function_ = 'concludeConversation';

    try {
      const task = await this.databaseService.getTask(
        accountId,
        requestId,
        true,
      );

      if (!task) {
        this.logger.error({
          fn: function_,
          message: `No task found for account ${accountId} and requestId ${requestId}`,
          accountId,
          requestId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No task found for account ${accountId} and requestId ${requestId}`,
          ),
        );
      }

      // Decrement the conversation count in cache atomically
      try {
        await this.cache.decrementTaskConversationCount(requestId, 1);
      } catch (error) {
        this.logger.warn({
          fn: function_,
          message: `Failed to decrement conversation count for task ${requestId}`,
          accountId,
          requestId,
          error,
        });
      }

      this.databaseService.updateTask(
        accountId,
        requestId,
        {
          updatedAt: Date.now(),
          inFlightConversations:
            task.inFlightConversations - 1 < 0
              ? 0
              : task.inFlightConversations - 1,
          completedConversations: task.completedConversations + 1,
          completedConvIds: task.completedConvIds || [],
        },
        [],
      );

      const conversation: SimulationConversation =
        await this.cache.getConversation(accountId, conversationId);

      if (!conversation) {
        this.logger.error({
          fn: function_,
          message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const { brandName: brand_name } = task;

      const token = await this.appConfigService.getTokenWithFallback(
        task.accountId,
      );

      if (!token) {
        this.logger.error({
          fn: function_,
          message: `No token found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No token found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const promptId = task?.prompts?.conversationAssessment;

      if (!promptId) {
        this.logger.error({
          fn: function_,
          message: `No promptId found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No promptId found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const basePrompt = await this.databaseService.getPrompt(
        accountId,
        promptId,
        true, // attempt to get from cache
      );

      const { scenario, persona } = conversation;

      if (!scenario) {
        this.logger.error({
          fn: function_,
          message: `No scenario, persona or influences found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
          promptVariables: conversation?.promptVariables,
          conversation,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No scenario found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const conversationInfo =
        await this.conversationCloudService.getConversationInfo(
          accountId,
          token,
          conversationId,
        );

      if (!conversationInfo?.filtered || !conversationInfo?.transcript) {
        this.logger.error({
          fn: function_,
          message: `No filtered conversation details found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No conversation details found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      const { filtered, transcript } = conversationInfo;

      const record: SimulationConversation = Object.assign(
        Object.create(Object.getPrototypeOf(conversation)),
        conversation,
        { metadata: filtered },
      );

      let conversation_details = '';

      const toInclude = [
        'closeReason',
        'startTimeL',
        'endTimeL',
        'duration',
        'latestAgentFullName',
        'latestSkillName',
        'mcs',
        'mcsTrend',
      ];

      for (const [key, value] of Object.entries(filtered)) {
        if (value && toInclude.includes(key)) {
          conversation_details += `${key}: ${value}\n`;
        }
      }

      const closeReason = filtered?.closeReason || 'unknown';

      const prompt = fillPrompt(basePrompt, {
        transcript,
        conversation_details,
        scenario,
        persona,
        brand_name,
        closeReason,
      });

      const assessment = await this.aiStudioService.getFlowResponse({
        accountId,
        conv_id: conversation.aisConversationId,
        flow_id: conversation.flowId,
        token: insertCCBearer(token),
        prompt,
        messages: conversation.messages || [],
      });

      record.assessment = helper.findJSON(assessment?.text);
      if ('flowRequest' in conversation) delete conversation.flowRequest;

      if ('conversationSurveys' in conversation)
        delete conversation.conversationSurveys;

      await this.databaseService.updateConversation(accountId, conversationId, {
        assessment: record.assessment,
        active: false,
        status: CONVERSATION_STATE.CLOSE,
        state: CONVERSATION_SIMULATION_STATES.COMPLETED,
      });

      return record;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error concluding conversation for account ${accountId} and conversationId ${conversationId}: ${error}`,
        accountId,
        conversationId,
      });

      await this.databaseService.updateConversation(accountId, conversationId, {
        assessment: {
          score: '-',
          assessment: 'Error creating assessment',
        },
        active: false,
        status: CONVERSATION_STATE.CLOSE,
        state: CONVERSATION_SIMULATION_STATES.COMPLETED,
      });
    }
  }

  /**
   * same function as above, but does not update the conversation record in the database, just passes back the updated conversation
   * takes optional prompt id
   * fecthes conversation from databse if not in cache
   */
  async assessConversation(
    accountId: string,
    conversationId: string,
    promptId?: string,
  ): Promise<SimulationConversation | undefined> {
    const function_ = 'assessConversation';

    console.info('starting assessConversation', {
      accountId,
      conversationId,
      promptId,
    });

    const conversation: SimulationConversation =
      await this.databaseService.getConversation(
        accountId,
        conversationId,
        true,
      );

    if (!conversation) {
      this.logger.error({
        fn: function_,
        message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No conversation found for account ${accountId} and conversationId ${conversationId}`,
        ),
      );
    }

    const task = await this.databaseService.getTask(
      accountId,
      conversation.requestId,
      true,
    );

    const prompt = promptId || task?.prompts?.conversationAssessment;

    if (!prompt) {
      this.logger.error({
        fn: function_,
        message: `No prompt found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No prompt found for account ${accountId} and conversationId ${conversationId}`,
        ),
      );
    }

    const token = await this.appConfigService.getTokenWithFallback(accountId);

    if (!token) {
      this.logger.error({
        fn: function_,
        message: `No token found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No token found for account ${accountId} and conversationId ${conversationId}`,
        ),
      );
    }

    const basePrompt = await this.databaseService.getPromptById(
      accountId,
      prompt,
    );

    if (!basePrompt) {
      this.logger.error({
        fn: function_,
        message: `No basePrompt found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No basePrompt found for account ${accountId} and conversationId ${conversationId}`,
        ),
      );
    }

    const { scenario, persona } = conversation;

    if (!scenario) {
      this.logger.error({
        fn: function_,
        message: `No scenario, persona or influences found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
        promptVariables: conversation?.promptVariables,
        conversation,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No scenario found for account ${accountId} and conversationId ${conversationId}`,
        ),
      );
    }

    const conversationInfo =
      await this.conversationCloudService.getConversationInfo(
        accountId,
        token,
        conversationId,
      );

    if (!conversationInfo?.filtered || !conversationInfo?.transcript) {
      this.logger.error({
        fn: function_,
        message: `No filtered conversation details found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No conversation details found for account ${accountId} and conversationId ${conversationId}`,
        ),
      );
    }

    const { filtered, transcript } = conversationInfo;

    console.log('filtered', filtered);

    const record: SimulationConversation = Object.assign(
      Object.create(Object.getPrototypeOf(conversation)),
      conversation,
      { metadata: filtered },
    );

    let conversation_details = '';

    const toInclude = [
      'closeReason',
      'startTimeL',
      'endTimeL',
      'duration',
      'latestAgentFullName',
      'latestSkillName',
      'mcs',
      'mcsTrend',
    ];

    for (const [key, value] of Object.entries(filtered)) {
      if (value && toInclude.includes(key)) {
        conversation_details += `${key}: ${value}\n`;
      }
    }

    const closeReason = filtered?.closeReason || 'unknown';

    const { brandName: brand_name } = task;

    const promptText = fillPrompt(basePrompt, {
      transcript,
      conversation_details,
      scenario,
      persona,
      brand_name,
      closeReason,
    });

    const assessment = await this.aiStudioService.getFlowResponse({
      accountId,
      conv_id: conversation.aisConversationId,
      flow_id: conversation.flowId,
      token: insertCCBearer(token),
      prompt: promptText,
      messages: conversation.messages || [],
    });

    record.assessment = helper.findJSON(assessment?.text);
    if ('flowRequest' in conversation) delete conversation.flowRequest;

    if ('conversationSurveys' in conversation)
      delete conversation.conversationSurveys;

    record.assessment = record.assessment || {
      assessment: 'No assessment returned',
    };

    console.info('record', record);

    return record;
  }

  async getConversation(
    accountId: string,
    conversationId: string,
    includeAll?: boolean,
  ): Promise<SimulationConversation | undefined> {
    const conversation = await this.databaseService.getConversation(
      accountId,
      conversationId,
      true,
    );

    if (!conversation) {
      this.logger.warn({
        fn: 'getConversation',
        message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });
    }

    if (includeAll) {
      conversation.promptVariables = {
        ...conversation.promptVariables,
      };
    }

    return conversation;
  }

  /**
   * Calculates and returns comprehensive progress metrics for a simulation task.
   *
   * This method provides real-time visibility into task execution by analyzing conversation
   * states and computing key performance indicators. It's essential for monitoring
   * simulation progress and determining when tasks should be scaled or completed.
   *
   * @param task - The simulation task to analyze for progress metrics
   *
   * @returns Promise<{inflightConversations: number, completedConversations: number, remainingConversations: number}>
   *          Object containing current task progress statistics
   *
   * @throws {InternalServerErrorException} When task parameters are invalid or progress calculation fails
   *
   * @example
   * ```typescript
   * const progress = await simulationService.getTaskProgress(taskStatus);
   * console.log(`Progress: ${progress.completedConversations}/${taskStatus.maxConversations} completed`);
   * console.log(`Active: ${progress.inflightConversations}, Remaining: ${progress.remainingConversations}`);
   * ```
   *
   * @remarks
   * - Provides real-time progress tracking for active simulation tasks
   * - Calculates remaining conversation quota for resource planning
   * - Distinguishes between in-flight (active) and completed conversations
   * - Essential for task scheduling and capacity management decisions
   * - Used by monitoring systems to track simulation performance
   * - Helps determine when to queue additional conversations or complete tasks
   * - Critical for preventing conversation quota overruns
   */
  async getTaskProgress(task: TaskStatus): Promise<{
    completedConversations: number;
    inflightConversations: number;
    remainingConversations: number;
  }> {
    try {
      const { accountId, requestId } = task;

      if (!accountId || !requestId) {
        throw new InternalServerErrorException(
          `No accountId or requestId found for task ${JSON.stringify(task)}`,
        );
      }

      const { maxConversations } = task;

      const conversations = await this.cache.getConversationsByRequestId(
        accountId,
        requestId,
      );

      const completedConversations = conversations.filter(
        (c) => c.status === CONVERSATION_STATE.CLOSE,
      ).length;

      const activeConversations = conversations.filter(
        (c) => c.status === CONVERSATION_STATE.OPEN,
      ).length;

      const remainingConversations =
        maxConversations - (completedConversations + activeConversations);

      return {
        inflightConversations: activeConversations || 0,
        completedConversations: completedConversations || 0,
        remainingConversations: remainingConversations || 0,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Error getting task status for account ${task.accountId} and requestId ${task.requestId}`,
        error,
      );
    }
  }

  /**
   * Retrieves complete task information including associated conversations and current progress.
   *
   * This method provides comprehensive task details by combining task metadata with all
   * related conversations and real-time progress calculations. It's the primary interface
   * for task status queries and monitoring dashboard integrations.
   *
   * @param accountId - The LivePerson account identifier for task scoping
   * @param requestId - The unique task request identifier to retrieve
   *
   * @returns Promise<{conversations: SimulationConversation[], task: TaskStatus} | undefined>
   *          Complete task details with conversations, or undefined if task not found
   *
   * @throws {InternalServerErrorException} When database queries fail or task validation errors occur
   *   *
   * @remarks
   * - Aggregates task metadata with complete conversation history
   * - Includes real-time progress calculations in task response
   * - Provides comprehensive view for monitoring and debugging
   * - Returns undefined for non-existent tasks rather than throwing errors
   * - Fetches conversations from both cache and database for completeness
   * - Essential for task management UI and reporting systems
   * - Includes both active and completed conversation records
   * - Combines database persistence with cache performance optimization
   */
  async getTaskById(
    accountId: string,
    requestId: string,
  ): Promise<
    | {
        conversations: SimulationConversation[];
        task: TaskStatus;
      }
    | undefined
  > {
    try {
      const conversations = await this.databaseService.getConversationsByTaskId(
        accountId,
        requestId,
        true,
      );

      const task = await this.databaseService.getTask(accountId, requestId);

      if (!task) {
        return undefined;
      }

      const progress = await this.getTaskProgress(task);

      // Create a new object that preserves the prototype of the original task
      const mergedTask = Object.assign(
        Object.create(Object.getPrototypeOf(task)),
        task,
        progress,
      ) as TaskStatus;

      return {
        task: mergedTask,
        conversations: conversations || [],
      };
    } catch (error) {
      this.logger.error({
        fn: 'getTaskById',
        message: `Error getting task by id for account ${accountId} and requestId ${requestId}: ${error}`,
        accountId,
        requestId,
        error,
      });

      throw new InternalServerErrorException(
        ...context_(context, 'getTaskById', error),
      );
    }
  }

  /**
   * Retrieves all cached simulation tasks for a specific account.
   *
   * This utility method provides fast access to all active and recent tasks from the cache layer,
   * enabling efficient account-wide task monitoring and management operations.
   *
   * @param accountId - The LivePerson account identifier to query tasks for
   *
   * @returns Promise<TaskStatus[]> Array of all cached tasks for the account
   *
   * @remarks
   * - Returns only cache-resident tasks for optimal performance
   * - Useful for quick task enumeration and account overview operations
   * - Does not include database-only historical tasks
   * - Ideal for real-time monitoring and dashboard implementations
   */
  async getAllCachedTasksByAccount(accountId: string): Promise<TaskStatus[]> {
    return await this.cache.getAllTasksByAccount(accountId);
  }

  /**
   * Immediately stops and closes a specific conversation within a simulation.
   *
   * This method provides granular control over individual conversations by terminating
   * them through the ConnectorAPI and updating their status across all data layers.
   * It's essential for manual intervention and conversation lifecycle management.
   *
   * @param accountId - The LivePerson account identifier for the conversation
   * @param conversationId - The specific conversation ID to stop and close
   *
   * @returns Promise<void> Resolves when conversation is successfully stopped
   *
   * @throws {InternalServerErrorException} When conversation termination fails
   *
   * @example
   * ```typescript
   * await simulationService.stopConversation('account123', 'conv456');
   * console.log('Conversation stopped successfully');
   * ```
   *
   * @remarks
   * - Immediately terminates the conversation through LivePerson ConnectorAPI
   * - Updates conversation status in both cache and database layers
   * - Handles conversation not found scenarios gracefully
   * - Essential for manual conversation management and error recovery
   * - Decrements task conversation counters appropriately
   * - Triggers conversation completion workflows and assessments
   */
  async stopConversation(
    accountId: string,
    conversationId: string,
  ): Promise<void> {
    const function_ = 'stopConversation';

    try {
      this.logger.info({
        fn: function_,
        message: `Stopping conversation ${conversationId} for account ${accountId}`,
        accountId,
        conversationId,
      });

      const conversation = await this.cache.getConversation(
        accountId,
        conversationId,
      );

      if (!conversation) {
        this.logger.error({
          fn: function_,
          message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      await this.connectorAPI.closeConversation(
        accountId,
        conversation.consumerToken,
        conversation.id,
        conversation.dialogId,
      );
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error stopping conversation for account ${accountId} and conversationId ${conversationId}: ${error}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
      );
    }
  }

  /**
   * Temporarily pauses a conversation while maintaining its state and context.
   *
   * This method allows for temporary suspension of conversation activity without terminating
   * the interaction. The conversation maintains all context and can be resumed later,
   * making it useful for debugging, analysis, or temporary intervention scenarios.
   *
   * @param accountId - The LivePerson account identifier for the conversation
   * @param conversationId - The specific conversation ID to pause
   *
   * @returns Promise<SimulationConversation> The updated conversation with paused state
   *
   * @throws {InternalServerErrorException} When conversation is not found or pause operation fails
   *
   * @example
   * ```typescript
   * const pausedConversation = await simulationService.pauseConversation('account123', 'conv456');
   * console.log(`Conversation paused: ${pausedConversation.state}`);
   * ```
   *
   * @remarks
   * - Preserves all conversation context and history during pause
   * - Updates conversation state to PAUSED in both cache and database
   * - Does not close the conversation or affect consumer session
   * - Enables temporary intervention without losing conversation flow
   * - Useful for manual analysis or debugging of conversation behavior
   * - Can be resumed later to continue the interaction seamlessly
   */
  async pauseConversation(
    accountId: string,
    conversationId: string,
  ): Promise<SimulationConversation> {
    const function_ = 'pauseConversation';

    try {
      const conversation = await this.cache.getConversation(
        accountId,
        conversationId,
      );

      if (!conversation) {
        this.logger.error({
          fn: function_,
          message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      conversation.state = CONVERSATION_SIMULATION_STATES.PAUSED;

      await this.databaseService.updateConversation(accountId, conversationId, {
        state: CONVERSATION_SIMULATION_STATES.PAUSED,
      });

      return conversation;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error pausing conversation for account ${accountId} and conversationId ${conversationId}: ${error}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `Error pausing conversation for account ${accountId} and conversationId ${conversationId}`,
          error,
        ),
      );
    }
  }

  /**
   * Resumes a previously paused conversation, restoring its active simulation state.
   *
   * This method reactivates a paused conversation, allowing the synthetic customer
   * to continue interacting based on the preserved context and conversation flow.
   * It seamlessly transitions from pause back to active simulation.
   *
   * @param accountId - The LivePerson account identifier for the conversation
   * @param conversationId - The specific conversation ID to resume
   *
   * @returns Promise<SimulationConversation> The updated conversation with active state
   *
   * @throws {InternalServerErrorException} When conversation is not found or resume operation fails
   *
   * @example
   * ```typescript
   * const resumedConversation = await simulationService.resumeConversation('account123', 'conv456');
   * console.log(`Conversation resumed: ${resumedConversation.state}`);
   * ```
   *
   * @remarks
   * - Restores conversation to ACTIVE state for continued simulation
   * - Preserves all conversation history and context from before pause
   * - Updates state in both cache and database layers
   * - Enables seamless continuation of synthetic customer interaction
   * - Restores normal AI response generation and message flow
   * - Critical for debugging workflows and manual intervention scenarios
   */
  async resumeConversation(
    accountId: string,
    conversationId: string,
  ): Promise<SimulationConversation> {
    const function_ = 'resumeConversation';

    try {
      const conversation = await this.cache.getConversation(
        accountId,
        conversationId,
      );

      if (!conversation) {
        this.logger.error({
          fn: function_,
          message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No conversation found for account ${accountId} and conversationId ${conversationId}`,
          ),
        );
      }

      conversation.state = CONVERSATION_SIMULATION_STATES.ACTIVE;

      await this.databaseService.updateConversation(accountId, conversationId, {
        state: CONVERSATION_SIMULATION_STATES.ACTIVE,
      });

      return conversation;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error resuming conversation for account ${accountId} and conversationId ${conversationId}: ${error}`,
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `Error resuming conversation for account ${accountId} and conversationId ${conversationId}`,
          error,
        ),
      );
    }
  }
}
