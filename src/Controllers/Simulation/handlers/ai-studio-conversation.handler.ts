import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { helper } from 'src/utils/HelperService';

import { AIStudioService } from '../../AIStudio/ai-studio.service';
import { CacheService } from '../../Cache/cache.service';
import { AppConfigurationService } from '../../Configuration/configuration.service';
import { ConnectorAPIService } from '../../ConnectorAPI/connector-api.service';
import { DatabaseService } from '../../Database/database.service';
import { SimulationConversation, TaskStatus } from '../simulation.dto';

import { BaseConversationCreator } from './base-conversation-creator';
import {
  IConversationHandler,
  MessageResponse,
} from './conversation-handler.interface';

const insertCCBearer = helper.insertCCBearer.bind(helper);
const context_ = helper.ctx.bind(helper);
const context = '[AIStudioConversationHandler]';

@Injectable()
export class AIStudioConversationHandler implements IConversationHandler {
  constructor(
    @InjectPinoLogger(AIStudioConversationHandler.name)
    private readonly logger: PinoLogger,
    private readonly baseCreator: BaseConversationCreator,
    private readonly aiStudioService: AIStudioService,
    @Inject(forwardRef(() => ConnectorAPIService))
    private readonly connectorAPI: ConnectorAPIService,
    @Inject(forwardRef(() => AppConfigurationService))
    private readonly appConfigService: AppConfigurationService,
    private readonly databaseService: DatabaseService,
    private readonly cache: CacheService,
  ) {
    this.logger.setContext(context);
  }

  async createConversation(task: TaskStatus): Promise<string | null> {
    const function_ = 'createConversation';
    const { requestId, accountId, useFakeNames, skillId: _skillId } = task;

    try {
      const skillId = _skillId;

      const customerDetails = this.baseCreator.generateCustomerDetails(
        undefined,
        useFakeNames,
      );

      // Setup conversation prerequisites
      const setup = await this.baseCreator.setupConversationPrerequisites(
        task,
        customerDetails,
        skillId,
      );

      // Generate first response using AI Studio flow
      const firstMessage = await this.getFirstResponse(
        task,
        '', // conversationId not needed for first response
        setup.aisConversationId,
      );

      if (!firstMessage?.text) {
        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            'No first message generated',
            accountId,
          ),
        );
      }

      // Create LivePerson conversation
      const conversationId =
        await this.baseCreator.createLivePersonConversation(
          task,
          setup.appJwt,
          setup.consumerToken,
          skillId,
          customerDetails,
        );

      // Create conversation payload
      const payload = this.baseCreator.createConversationPayload(
        task,
        conversationId,
        setup,
      );

      // Store conversation in both cache and database
      const conversationData = JSON.parse(JSON.stringify(payload));

      await Promise.all([
        this.databaseService.addConversation(accountId, conversationData),
        this.cache.addConversation(accountId, conversationData),
      ]);

      // Update task conversation count
      await Promise.all([
        this.cache.updateTask(accountId, requestId, {
          inFlightConversations: task.inFlightConversations + 1,
        }),
        this.databaseService.updateTask(
          accountId,
          requestId,
          {
            inFlightConversations: task.inFlightConversations + 1,
            updatedAt: Date.now(),
          },
          [],
        ),
      ]);

      // Publish the first message
      await this.connectorAPI.publishConsumerMessage(
        accountId,
        setup.consumerToken,
        firstMessage.text,
        conversationId,
      );

      return conversationId;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error creating AI Studio conversation for account ${accountId}`,
        error: error.message || error,
        accountId,
        requestId,
      });

      // Decrement conversation count on failure
      try {
        await this.cache.decrementTaskConversationCount(requestId, 1);
      } catch (decrementError) {
        this.logger.warn({
          fn: function_,
          message: `Failed to decrement conversation count after error`,
          accountId,
          requestId,
          error: decrementError,
        });
      }

      throw new InternalServerErrorException(error);
    }
  }

  async getFirstResponse(
    task: TaskStatus,
    conversationId: string,
    aisConversationId: string,
  ): Promise<MessageResponse | null> {
    const function_ = 'getFirstResponse';
    const { syntheticCustomerflowId: flow_id, accountId } = task;

    try {
      const token = await this.appConfigService.getTokenWithFallback(accountId);

      if (!token) {
        this.logger.error({
          fn: function_,
          message: `No service worker token found for account ${accountId}`,
          accountId,
          aisConversationId,
        });

        return null;
      }

      const body = {
        text: 'start',
        source: 'CONVERSATIONAL_CLOUD',
        conv_id: aisConversationId,
        flow_id,
        save_answer: true,
        save_conv: true,
        engagement_attributes_in_response: true,
        debug: false,
        bot_context_vars: {},
      };

      return await this.aiStudioService.invokeFlow(
        accountId,
        insertCCBearer(token),
        body,
        flow_id,
      );
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error getting first response for AI Studio flow`,
        task: task.requestId,
        aisConversationId,
        error,
      });

      return null;
    }
  }

  async generateMessage(
    task: TaskStatus,
    conversation: Partial<SimulationConversation>,
    message: string,
  ): Promise<MessageResponse> {
    const function_ = 'generateMessage';
    const { accountId, syntheticCustomerflowId: flow_id } = task;
    const { aisConversationId } = conversation;

    try {
      const token = await this.appConfigService.getTokenWithFallback(accountId);

      if (!token) {
        throw new InternalServerErrorException(
          ...context_(
            context,
            function_,
            `No token found for account ${accountId}`,
          ),
        );
      }

      const body = {
        text: message || 'start',
        source: 'CONVERSATIONAL_CLOUD',
        conv_id: aisConversationId,
        flow_id,
        save_answer: true,
        save_conv: true,
        engagement_attributes_in_response: true,
        debug: false,
        bot_context_vars: {},
      };

      return await this.aiStudioService.invokeFlow(
        accountId,
        insertCCBearer(token),
        body,
        flow_id,
      );
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error generating AI Studio message for account ${accountId}`,
        conversationId: conversation.id,
        error,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          'Error generating AI Studio message',
          error,
        ),
      );
    }
  }
}
