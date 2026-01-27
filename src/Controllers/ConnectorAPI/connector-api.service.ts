import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CollectionReference } from '@google-cloud/firestore';
import { randomInt } from 'crypto';
import { jwtDecode } from 'jwt-decode';
import { last } from 'rxjs';
import { uuid } from 'short-uuid';

import {
  AGENT_ROLES,
  AUDIENCES,
  CONVERSATION_ROLES,
  CONVERSATION_SIMULATION_STATES,
  CONVERSATION_STATE,
  DIALOG_TYPES,
  LPDomains,
  SIMULATION_STATUS,
} from 'src/constants/constants';
import { CacheService } from 'src/Controllers/Cache/cache.service';
import { SimulationService } from 'src/Controllers/Simulation/simulation.service';
import { ExChangeEvent } from 'src/interfaces/interfaces';
import { helper } from 'src/utils/HelperService';

import { APIService } from '../APIService/api-service';
import { PersistentIdentityDto } from '../Database/database.dto';
import { DatabaseService } from '../Database/database.service';
import { HelperService } from '../HelperService/helper-service.service';
import { AnalysisService } from '../Simulation/reports/analysis.service';
import {
  SimulationConversation,
  TaskProgress,
  TaskStatus,
} from '../Simulation/simulation.dto';

@Injectable()
export class ConnectorAPIService {
  schedulerInterval: number;
  intvl: string;
  cron: NodeJS.Timeout;
  isInitialised = false;
  convCache: Record<string, { count: number }> = {};

  constructor(
    private configService: ConfigService = new ConfigService(),
    @InjectPinoLogger(ConnectorAPIService.name)
    private readonly logger: PinoLogger,
    @Inject(SimulationConversation.collectionName)
    private conversationCollection: CollectionReference<SimulationConversation>,
    private readonly helperService: HelperService,
    @Inject(forwardRef(() => SimulationService))
    private readonly conversationSimulatorService: SimulationService,
    @Inject(forwardRef(() => DatabaseService))
    private readonly databaseService: DatabaseService,
    private readonly apiService: APIService,
    private readonly cache: CacheService,
    private readonly analysisService: AnalysisService,
  ) {
    this.logger.setContext('ConnectorAPIService');
  }

  /**
   * Retrieves and caches the application JWT (JSON Web Token) for authenticating with LivePerson services.
   *
   * This method handles the complete OAuth2 client credentials flow for obtaining application-level access tokens.
   * It implements smart caching to avoid redundant API calls and handles domain resolution for the Sentinel service.
   * The JWT is essential for making authenticated requests to LivePerson's Conversational Cloud APIs.
   *
   * Key functionality:
   * - Checks cache for existing valid JWT before making API calls
   * - Resolves the correct Sentinel domain for the account
   * - Executes OAuth2 client credentials flow with configured client ID/secret
   * - Caches the JWT with proper expiration time for performance
   * - Provides comprehensive error handling and logging
   *
   * @param accountId - The LivePerson account identifier (site ID)
   * @returns Promise resolving to the JWT access token string, or null if authentication fails
   * @throws InternalServerErrorException when domain resolution fails or OAuth flow encounters errors
   *
   * @example
   * ```typescript
   * const jwt = await connectorService.getAppJwt('12345678');
   * if (jwt) {
   *   // Use JWT for authenticated API calls
   *   headers['Authorization'] = jwt;
   * }
   * ```
   */
  async getAppJwt(accountId: string): Promise<string | null> {
    try {
      const cachedAppJwt = await this.cache.getAppJwt(accountId);

      if (cachedAppJwt) {
        return cachedAppJwt;
      }

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.Sentinel,
      );

      if (!domain) {
        this.logger.error({
          fn: 'getAppJwt',
          level: 'error',
          message: 'Domain not found for service: sentinel',
          accountId,
        });

        return null;
      }

      const clientId = this.configService.get<string>('VUE_APP_CLIENT_ID');

      const clientSecret = this.configService.get<string>(
        'VUE_APP_CLIENT_SECRET',
      );

      const url = `https://${domain}/sentinel/api/account/${accountId}/app/token?v=1.0&grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      const response = await this.apiService.post<any>(url, {}, { headers });

      if (!response?.data) {
        this.logger.error({
          fn: 'getAppJwt',
          level: 'error',
          message: 'Failed to retrieve app jwt',
          accountId,
        });

        throw new InternalServerErrorException('Failed to retrieve app jwt');
      }

      const appJwt: any = response.data;
      const accessToken = appJwt.access_token;

      await this.cache.setAppJwt(accountId, accessToken, appJwt.expires_in);

      return accessToken;
    } catch (error) {
      throw new InternalServerErrorException(
        `Error getting app jwt for account ${accountId}`,
        error,
      );
    }
  }

  /**
   * Publishes synthetic customer messages to LivePerson's Universal Messaging Service (UMS).
   *
   * This method handles the complete message publishing workflow for synthetic customers, including
   * message validation, conversation state verification, and proper message delivery through LivePerson's
   * asynchronous messaging platform. It ensures messages are properly attributed to synthetic customers
   * and maintains conversation flow integrity.
   *
   * Key message publishing features:
   * - **Message validation**: Ensures message content and conversation context are valid
   * - **Conversation state checking**: Verifies conversation is active before sending
   * - **Authentication handling**: Manages both app-level and consumer-level authentication
   * - **Dialog context**: Supports both conversation-level and dialog-specific messaging
   * - **State synchronization**: Updates conversation state after successful message delivery
   * - **Error resilience**: Comprehensive error handling and recovery mechanisms
   *
   * The publishing process:
   * 1. Validates message content and conversation identifiers
   * 2. Retrieves and verifies conversation state from cache
   * 3. Obtains application JWT for API authentication
   * 4. Constructs proper UMS message payload with content event structure
   * 5. Publishes message through LivePerson's messaging API
   * 6. Updates conversation state to reflect message delivery
   *
   * @param accountId - The LivePerson account identifier for API routing
   * @param consumerJws - Consumer JWS token for customer identity authentication
   * @param message - The text content of the message to be published
   * @param conversationId - Unique identifier of the target conversation
   * @param dialogId - Optional dialog identifier for dialog-specific messaging context
   * @returns Promise resolving to the API response data, or null if publishing fails
   * @throws InternalServerErrorException when required parameters are missing or validation fails
   *
   * @example
   * ```typescript
   * const result = await connectorService.publishConsumerMessage(
   *   accountId,
   *   consumerJws,
   *   'Hello, I need help with my order',
   *   conversationId,
   *   dialogId
   * );
   * ```
   */
  async publishConsumerMessage(
    accountId: string,
    consumerJws: string,
    message: string,
    conversationId: string,
    dialogId?: string,
  ): Promise<any> | null {
    try {
      if (!message) {
        this.logger.error({
          fn: 'publishConsumerMessage',
          level: 'error',
          message: 'Message is required',
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(`Message is required`);
      }

      if (!conversationId) {
        this.logger.error({
          fn: 'publishConsumerMessage',
          level: 'error',
          message: 'Conversation id is required',
          accountId,
          conversationId,
        });

        throw new InternalServerErrorException(`Conversation id is required`);
      }

      const conversation = await this.cache.getConversation(
        accountId,
        conversationId,
      );

      if (!conversation || conversation.status === CONVERSATION_STATE.CLOSE) {
        return;
      }

      dialogId = conversation?.dialogId || dialogId || conversationId;
      const appJwt = await this.getAppJwt(accountId);

      if (!appJwt) {
        throw new InternalServerErrorException(`AppJwt is required`);
      }

      const request_body: any = {
        kind: 'req',
        id: '1',
        type: 'ms.PublishEvent',
        body: {
          conversationId,
          dialogId: dialogId || conversationId,
          event: {
            type: 'ContentEvent',
            contentType: 'text/plain',
            message: message,
          },
        },
      };

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AsyncMessagingEnt,
      );

      const url = `https://${domain}/api/account/${accountId}/messaging/consumer/conversation/send?v=3`;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: appJwt,
        'X-LP-ON-BEHALF': consumerJws,
      };

      const { data } =
        (await this.apiService.post<any>(url, request_body, { headers })) || {};

      if (!data) {
        this.logger.error({
          fn: 'publishConsumerMessage',
          level: 'error',
          message: 'Failed to publish consumer message',
          accountId,
          conversationId,
        });

        return null;
      }

      await this.databaseService.updateConversation(accountId, conversationId, {
        agentMessages: [],
        pendingConsumer: false,
        queued: false,
      });

      return data;
    } catch (error) {
      this.logger.error({
        fn: 'publishConsumerMessage',
        level: 'error',
        message: 'Error publishing consumer message',
        accountId,
        error,
      });
    }
  }

  /**
   * Creates and manages consumer JWT Web Signature (JWS) tokens for synthetic customer authentication.
   *
   * This method generates secure consumer identity tokens that allow synthetic customers to participate
   * in LivePerson conversations. It handles the complete consumer registration flow with the Identity
   * Provider (IDP) service, including token caching and consumer ID mapping.
   *
   * The consumer JWS token is crucial for:
   * - Authenticating synthetic customers in messaging conversations
   * - Maintaining consistent identity across conversation sessions
   * - Enabling proper message attribution and routing
   * - Supporting LivePerson's security and compliance requirements
   *
   * Key features:
   * - Generates unique consumer identifiers if not provided
   * - Caches tokens to avoid redundant registration calls
   * - Maps external consumer IDs to internal LivePerson consumer IDs
   * - Extracts and caches LP consumer ID from JWT payload
   * - Implements comprehensive error handling and validation
   *
   * @param accountId - The LivePerson account identifier for domain resolution
   * @param appJwt - Valid application JWT for authenticating the registration request
   * @param consumerId - Optional external consumer identifier; auto-generated if not provided
   * @returns Promise resolving to consumer authentication object containing tokens and IDs
   * @throws InternalServerErrorException when domain resolution, registration, or token parsing fails
   *
   * @example
   * ```typescript
   * const consumer = await connectorService.getConsumerJWT(accountId, appJwt, 'customer-123');
   * // Returns: {
   * //   consumer_token: 'eyJhbGciOiJSUzI1NiIsInR5cC...',
   * //   lp_consumer_id: 'internal-lp-id',
   * //   ext_consumer_id: 'customer-123'
   * // }
   * ```
   */
  async getConsumerJWT(
    accountId: string,
    appJwt: string,
    consumerId?: string,
  ): Promise<any | null> {
    try {
      const cachedConsumerJwt = await this.cache.get(`token_${consumerId}`);

      if (cachedConsumerJwt) {
        return cachedConsumerJwt;
      }

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.Idp,
      );

      if (!domain) {
        this.logger.error({
          fn: 'getConsumerJWT',
          level: 'error',
          message: 'Domain not found for service: idp',
          accountId: accountId,
        });

        throw new InternalServerErrorException(
          `Domain not found for service: idp`,
        );
      }

      const extensionConsumerId = consumerId || uuid();
      const url = `https://${domain}/api/account/${accountId}/consumer?v=1.0`;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: appJwt,
      };

      const body = {
        ext_consumer_id: extensionConsumerId,
      };

      const { data } =
        (await this.apiService.post<{ token: string }>(url, body, {
          headers,
        })) || {};

      if (!data) {
        this.logger.error({
          fn: 'getConsumerJWT',
          level: 'error',
          message: 'No data found',
          accountId,
        });

        throw new InternalServerErrorException('[getConsumerJWT] No response');
      }

      const { token } = data || {};

      if (!token) {
        this.logger.error({
          fn: 'getConsumerJWT',
          level: 'error',
          message: 'No token found',
          accountId,
        });

        throw new InternalServerErrorException(
          '[getConsumerJWT] No token found',
        );
      }

      await this.cache.set(`token_${extensionConsumerId}`, token, 3600);

      const decodedJwt: any = jwtDecode(token);
      const lpConsumerId = decodedJwt.lp_consumer_id;

      await this.cache.set(
        `lp_consumer_id_${extensionConsumerId}`,
        lpConsumerId,
        3600,
      );

      const returnObject = {
        consumer_token: token,
        lp_consumer_id: lpConsumerId,
        ext_consumer_id: extensionConsumerId,
      };

      return returnObject;
    } catch (error) {
      this.logger.error({
        fn: 'getConsumerJWT',
        level: 'error',
        message: 'Error getting consumer jws',
        accountId,
        error,
      });

      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Creates a new conversation session in LivePerson's Conversational Cloud platform.
   *
   * This method orchestrates the complex conversation initialization process, handling consumer
   * profile setup, conversation creation, and proper routing to designated skills. It implements
   * sophisticated conversation limits management and supports rich consumer context through SDES
   * (Structured Data Entities) for personalized customer experiences.
   *
   * The conversation creation involves:
   * - Consumer profile initialization with personal information and SDES data
   * - Conversation request with proper skill routing and channel configuration
   * - Conversation limit validation to prevent resource exhaustion
   * - Context establishment with scenario and persona information
   * - Proper client capability advertisement for feature negotiation
   *
   * Key features:
   * - Enforces configurable conversation limits per task to prevent resource exhaustion
   * - Supports fake name generation for realistic customer personas
   * - Implements structured data entities (SDES) for rich customer context
   * - Handles skill-based routing for targeted agent assignment
   * - Provides comprehensive client capability advertisement
   * - Includes detailed error handling and logging for debugging
   *
   * @param task - The simulation task containing configuration and limits
   * @param appJwt - Valid application JWT for API authentication
   * @param consumerToken - Consumer JWS token for customer identity
   * @param skillId - Target skill ID for conversation routing
   * @param name - Optional customer name object with first/last name properties
   * @param scenario - Customer scenario context for agent reference
   * @param persona - Customer persona type for simulation context
   * @returns Promise resolving to object containing the created conversation ID
   * @throws InternalServerErrorException when conversation limits are exceeded or creation fails
   *
   * @example
   * ```typescript
   * const conversation = await connectorService.sendCreateConversationRequest(
   *   task,
   *   appJwt,
   *   consumerToken,
   *   123456,
   *   { firstName: 'John', lastName: 'Doe' },
   *   'Product Support',
   *   'Frustrated Customer'
   * );
   * ```
   */
  async sendCreateConversationRequest(
    task: TaskStatus,
    appJwt: string,
    consumerToken: string,
    skillId: number,
    name: {
      firstName?: string | null;
      lastName?: string | null;
    } = {},
    scenario: string,
    persona: string,
    identity?: PersistentIdentityDto,
  ): Promise<{ conversationId: string }> | null {
    const { accountId, requestId, useFakeNames } = task;

    // try {
    if (!accountId || !requestId) {
      this.logger.error({
        fn: '[0].sendCreateConversationRequest',
        level: 'error',
        message: 'Account id and request id are required',
        accountId,
        requestId,
      });

      throw new InternalServerErrorException(
        `Account id and request id are required`,
      );
    }

    const { request: currentCount } =
      await this.cache.getActiveConversationDetails(accountId, requestId);

    const limit = await this.cache.getMaxConversationLimit(requestId);

    if (currentCount >= limit) {
      this.logger.error({
        fn: '[1].sendCreateConversationRequest',
        level: 'error',
        message: `Conversation limit reached for task ${requestId}.`,
        accountId,
        currentCount: currentCount,
        limit: limit,
      });

      task.errorReason = `Conversation limit reached for task ${requestId}. Current count: ${currentCount}, Limit: ${limit}`;
      await this.databaseService.updateTask(accountId, requestId, task, []);
      throw new InternalServerErrorException(
        `Conversation limit reached for task ${requestId}. Current count: ${currentCount}, Limit: ${limit}`,
      );
    }

    const request1 = {
      kind: 'req',
      id: '1',
      type: 'userprofile.SetUserProfile',
      body: {},
    };

    const authenticatedData = {
      lp_sdes: [],
    };

    if (useFakeNames && name.firstName && name.lastName) {
      authenticatedData.lp_sdes.push({
        type: 'personal',
        personal: {
          firstname: name.firstName,
          lastname: name.lastName,
          language: 'en-US',
          contacts: [
            {
              email:
                identity?.email ||
                helper.createEmail(name.firstName, name.lastName),
            },
          ],
        },
      });

      authenticatedData.lp_sdes.push({
        type: 'ctmrinfo',
        info: {
          cstatus: scenario || '',
          ctype: persona || '',
        },
      });

      request1.body = {
        authenticatedData,
      };
    }

    const request_body = [
      request1,
      {
        kind: 'req',
        id: '2',
        type: 'cm.ConsumerRequestConversation',
        body: {
          ttrDefName: 'NORMAL',
          channelType: 'MESSAGING',
          brandId: accountId,
          skillId,
          conversationContext: {
            interactionContextId: uuid(),
            type: 'SharkContext',
            lang: 'en-US',
            clientProperties: {
              type: '.ClientProperties',
              appId: 'webAsync',
              integrationVersion: '3.0.5',
              integration: 'WEB_SDK',
              features: [
                'AUTO_MESSAGES',
                'RICH_CONTENT',
                'CO_BROWSE',
                'PHOTO_SHARING',
                'QUICK_REPLIES',
                'MULTI_DIALOG',
              ],
            },
          },
        },
      },
    ];

    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.AsyncMessagingEnt,
    );

    if (!domain) {
      this.logger.error({
        fn: 'sendCreateConversationRequest',
        level: 'error',
        message: 'Domain not found for service: asyncMessagingEnt',
        accountId,
      });

      return null;
    }

    const { data } = await this.apiService.post<any[]>(
      `https://${domain}/api/account/${accountId}/messaging/consumer/conversation?v=3`,
      request_body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: appJwt,
          'X-LP-ON-BEHALF': consumerToken,
        },
      },
    );

    await this.cache.incrementTaskConversationCount(requestId, 1);
    const conversation_body = data?.find((item: any) => item.reqId === '2');
    const conversationId = conversation_body?.body?.conversationId;

    return {
      conversationId,
    };
  }

  /**
   * Terminates a conversation session in LivePerson's Conversational Cloud platform.
   *
   * This method handles the graceful closure of conversations, supporting both simple conversation
   * closure and advanced dialog-based closure for post-conversation survey scenarios. It ensures
   * proper conversation state transitions and enables post-conversation survey (PCS) flows when
   * dialog IDs are provided.
   *
   * The closure process involves:
   * - Validation of required authentication tokens and conversation identifiers
   * - Selection of appropriate closure method (conversation vs dialog level)
   * - Proper state transition messaging to LivePerson platform
   * - Support for post-conversation survey initiation through dialog closure
   * - Comprehensive error handling and logging
   *
   * Closure types:
   * - **Simple closure**: Updates conversation state to CLOSE (when no dialogId provided)
   * - **Dialog closure**: Closes specific dialog and triggers PCS flow (when dialogId provided)
   *
   * @param accountId - The LivePerson account identifier for domain resolution
   * @param consumerJws - Consumer JWS token for authentication and authorization
   * @param conversationId - Unique identifier of the conversation to close
   * @param dialogId - Optional dialog identifier for dialog-specific closure and PCS triggering
   * @returns Promise resolving to the API response data, or null if operation fails
   * @throws InternalServerErrorException when required parameters are missing or API calls fail
   *
   * @example
   * ```typescript
   * // Simple conversation closure
   * await connectorService.closeConversation(accountId, consumerJws, conversationId);
   *
   * // Dialog closure with PCS trigger
   * await connectorService.closeConversation(accountId, consumerJws, conversationId, dialogId);
   * ```
   */
  async closeConversation(
    accountId: string,
    consumerJws: string,
    conversationId: string,
    dialogId?: string,
  ): Promise<any> | null {
    const function_ = 'closeConversation';

    try {
      if (!conversationId) {
        throw new InternalServerErrorException(`Conversation id is required`);
      }

      const appJwt = await this.getAppJwt(accountId);

      if (!appJwt) {
        throw new InternalServerErrorException(`AppJwt is required`);
      }

      if (!consumerJws) {
        throw new InternalServerErrorException(`Consumer JWS is required`);
      }

      if (!accountId) {
        throw new InternalServerErrorException(`Site id is required`);
      }

      const request_body = !dialogId
        ? {
            kind: 'req',
            id: 1,
            body: {
              conversationId,
              conversationField: {
                field: 'ConversationStateField',
                conversationState: 'CLOSE',
              },
            },
            type: 'cm.UpdateConversationField',
          }
        : {
            kind: 'req',
            id: 1,
            body: {
              conversationId,
              conversationField: {
                field: 'DialogChange',
                type: 'UPDATE',
                dialog: {
                  dialogId,
                  state: 'CLOSE',
                  closedCause: 'Closed by consumer',
                },
              },
            },
            type: 'cm.UpdateConversationField',
          };

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AsyncMessagingEnt,
      );

      if (!domain) {
        this.logger.error({
          fn: function_,
          level: 'error',
          message: 'Domain not found for service: asyncMessagingEnt',
          accountId,
        });

        return null;
      }

      const url = `https://${domain}/api/account/${accountId}/messaging/consumer/conversation/send?v=3`;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: appJwt,
        'X-LP-ON-BEHALF': consumerJws,
      };

      const { data } =
        (await this.apiService.post<any>(url, request_body, { headers })) || {};

      if (!data) {
        this.logger.error({
          fn: 'closeConversation',
          level: 'error',
          message: 'No data found',
          accountId,
        });

        return null;
      }

      return data;
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error closing conversation',
        accountId,
        conversationId,
        error,
      });
    }
  }

  /**
   * Retrieves simulation task configuration and status data from the database.
   *
   * This method provides access to comprehensive task information including configuration parameters,
   * execution status, conversation limits, and task metadata. It serves as the central data access
   * point for task-related operations and supports the complete task lifecycle management.
   *
   * The retrieved task data includes:
   * - Task configuration (max conversations, concurrency limits, delays)
   * - Execution status and progress tracking
   * - Account association and user context
   * - Error states and diagnostic information
   * - Timing and scheduling parameters
   *
   * This method is essential for:
   * - Task progress monitoring and status reporting
   * - Conversation limit enforcement and validation
   * - Task state management and lifecycle control
   * - Configuration retrieval for simulation execution
   * - Error handling and diagnostic data access
   *
   * @param accountId - The LivePerson account identifier for data isolation and security
   * @param requestId - Unique identifier of the simulation task to retrieve
   * @returns Promise resolving to the complete task status object, or null if not found
   *
   */
  async getTaskRequestData(
    accountId: string,
    requestId: string,
  ): Promise<TaskStatus | null> {
    try {
      const taskRequest = await this.databaseService.getTask(
        accountId,
        requestId,
      );

      if (!taskRequest) {
        this.logger.error({
          fn: 'getTaskRequestData',
          level: 'error',
          message: 'Task request data not found',
          accountId,
          requestId,
        });

        return null;
      }

      return taskRequest;
    } catch (error) {
      this.logger.error({
        fn: 'getTaskRequestData',
        level: 'error',
        message: 'Error getting task request data',
        accountId,
        requestId,
        error,
      });

      return null;
    }
  }

  /**
   * Retrieves conversation records from both cache and persistent storage with intelligent fallback.
   *
   * This method implements a multi-tier data access pattern, first checking the high-performance
   * cache layer before falling back to Firestore database queries. It's designed to provide fast
   * access to conversation data while maintaining data consistency and supporting both cached and
   * persistent storage scenarios.
   *
   * The retrieval process follows this hierarchy:
   * 1. **Cache lookup**: Attempts to retrieve from Redis/memory cache for optimal performance
   * 2. **Database fallback**: Queries Firestore when cache miss occurs
   * 3. **Data validation**: Ensures retrieved data integrity and completeness
   * 4. **Error handling**: Provides graceful degradation with optional logging suppression
   *
   * This method is crucial for:
   * - High-performance conversation data access during active simulations
   * - Supporting both real-time operations and historical data retrieval
   * - Maintaining data consistency across distributed cache and database layers
   * - Enabling efficient conversation state management
   *
   * @param accountId - The LivePerson account identifier for data isolation
   * @param conversationId - Unique identifier of the conversation to retrieve
   * @param hideLogging - Optional flag to suppress error logging for non-critical operations
   * @returns Promise resolving to the complete conversation record, or null if not found
   *
   * @example
   * ```typescript
   * // Standard retrieval with full logging
   * const conversation = await connectorService.getConversationRecord(accountId, conversationId);
   *
   * // Silent retrieval for existence checks
   * const exists = await connectorService.getConversationRecord(accountId, conversationId, true);
   * ```
   */
  async getConversationRecord(
    accountId: string,
    conversationId: string,
    hideLogging?: boolean,
  ): Promise<SimulationConversation | null> {
    const conversation = await this.cache.getConversation(
      accountId,
      conversationId,
    );

    if (conversation) {
      return conversation;
    }

    const conversationDocument = await this.conversationCollection
      .doc(conversationId)
      .get();

    if (!conversationDocument.exists) {
      if (!hideLogging) {
        this.logger.error({
          fn: 'getConversationRecord',
          level: 'error',
          message: 'Conversation not found',
          accountId,
          conversationId,
        });

        return null;
      }
    }

    const conversationData = conversationDocument.data();

    if (!conversationData) {
      this.logger.error({
        fn: 'getConversationRecord',
        level: 'error',
        message: 'Conversation data not found',
        accountId,
        conversationId,
      });

      return null;
    }

    return conversationData;
  }

  /**
   * Processes agent content events to manage synthetic customer response workflows.
   *
   * This method serves as the core event processor for agent messages within simulation conversations,
   * implementing sophisticated filtering, validation, and response scheduling logic. It ensures only
   * relevant agent messages trigger synthetic customer responses while maintaining proper conversation
   * flow and respecting configured interaction patterns.
   *
   * Critical event filtering logic:
   * - **Role validation**: Only processes messages from valid agent roles (excludes bots, controllers)
   * - **Audience filtering**: Processes only public messages (messageAudience === 'ALL')
   * - **Conversation validation**: Ensures events belong to active simulation conversations
   * - **Message content validation**: Filters out empty or invalid message content
   * - **Simulation state checking**: Respects task status and prevents processing terminated simulations
   *
   * Response scheduling features:
   * - **Intelligent delays**: Implements configurable response delays for realistic interaction timing
   * - **Turn management**: Tracks conversation turns and enforces maximum turn limits
   * - **Dialog context**: Supports different response patterns for surveys vs normal conversation
   * - **Batching prevention**: Handles agent message batching by queuing appropriate responses
   * - **Conversation closure**: Automatically closes conversations when turn limits are exceeded
   *
   * The processing workflow:
   * 1. Filters and validates incoming agent messages
   * 2. Retrieves conversation context and task configuration
   * 3. Updates conversation state with new agent message
   * 4. Calculates appropriate response timing based on conversation type
   * 5. Schedules synthetic customer response through queue system
   * 6. Maintains conversation state and progress tracking
   *
   * @param accountId - The LivePerson account identifier for data isolation
   * @param data - The content event payload containing agent message and metadata
   *
   * @example
   * ```typescript
   * // Called by webhook handler when agent sends messages
   * await connectorService.contentEvent(accountId, contentEventData);
   * ```
   */
  async contentEvent(accountId: string, data: any) {
    const function_ = 'contentEvent';

    const lastAgentmessage = this.findLastAgentMessage(data);

    if (!this.isValidAgentMessage(lastAgentmessage)) {
      return;
    }

    const conversationId = lastAgentmessage.conversationId;

    const conversation = await this.getConversationRecord(
      accountId,
      conversationId,
      true, // suppress logging
    );

    if (!conversation) {
      return;
    }

    const conversationSimulationState = conversation.state;

    if (conversationSimulationState === CONVERSATION_SIMULATION_STATES.PAUSED) {
      return;
    }

    const dialogType = conversation.dialogType;
    const isPostSurvey = dialogType === DIALOG_TYPES.POST_SURVEY;

    if (!conversation.active && !isPostSurvey) return;

    const taskRequestData = await this.getTaskRequestData(
      accountId,
      conversation.requestId,
    );

    if (!taskRequestData) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Task request data not found',
        accountId,
        conversationId,
      });

      return;
    }

    if (this.shouldIgnoreTaskStatus(taskRequestData.status)) {
      return;
    }

    const agentTurns = this.calculateAgentTurns(conversation);
    const agentSentMessages = (conversation.agentMessagesSentCount || 0) + 1;
    const maxTurns = taskRequestData.maxTurns || 20;

    conversation.agentMessagesSentCount = agentSentMessages;

    if (agentTurns > maxTurns && !isPostSurvey) {
      await this.closeConversation(
        accountId,
        conversation.consumerToken,
        conversation.id,
        conversation.dialogId,
      );

      return;
    }

    const now = Date.now();

    const agentMessages = this.buildAgentMessagesList(
      conversation,
      lastAgentmessage,
      now,
    );

    const consumerDelay = this.calculateConsumerDelay(
      isPostSurvey,
      taskRequestData.consumerMessageDelayRange,
    );

    const toUpdate = this.buildConversationUpdate(
      agentMessages,
      agentTurns,
      agentSentMessages,
      now,
      consumerDelay,
      isPostSurvey,
      dialogType,
      conversation.dialogId,
    );

    await this.databaseService.updateConversation(
      accountId,
      conversationId,
      toUpdate,
    );
  }

  /**
   * Finds the last agent message from content event changes
   */
  private findLastAgentMessage(data: any): any {
    return data.body.changes.find((change: any) => {
      return AGENT_ROLES.includes(change.originatorMetadata.role);
    });
  }

  /**
   * Validates if the agent message should be processed
   */
  private isValidAgentMessage(message: any): boolean {
    if (!message) return false;

    if (!message?.event?.message && message?.event?.message === '') {
      return false;
    }

    if (message.messageAudience !== AUDIENCES.ALL) return false;

    if (message.role === CONVERSATION_ROLES.CONTROLLER) return false;

    return true;
  }

  /**
   * Checks if task status should be ignored
   */
  private shouldIgnoreTaskStatus(status: SIMULATION_STATUS): boolean {
    return (
      status === SIMULATION_STATUS.CANCELLED ||
      status === SIMULATION_STATUS.COMPLETED ||
      status === SIMULATION_STATUS.ERROR
    );
  }

  /**
   * Calculates agent turns based on conversation state
   */
  private calculateAgentTurns(conversation: any): number {
    let agentTurns = conversation.agentTurns || 0;

    if (conversation.agentMessages?.length === 0) {
      agentTurns += 1;
    }

    return agentTurns;
  }

  /**
   * Builds the updated agent messages list
   */
  private buildAgentMessagesList(
    conversation: any,
    lastAgentmessage: any,
    now: number,
  ): string[] {
    const agentMessages = conversation.agentMessages || [];
    let message = helper.richToPlain(lastAgentmessage.event);

    if (lastAgentmessage.event.type === 'RichContentEvent') {
      message =
        '[Rich Content Message]:\n' +
        JSON.stringify(lastAgentmessage.event, null, 2);
    }

    message = `${message}\n(time sent ${new Date(now).toLocaleTimeString()})`;
    agentMessages.push(message);

    return agentMessages;
  }

  /**
   * Calculates consumer response delay in milliseconds
   * Uses cryptographically secure random number generation
   */
  private calculateConsumerDelay(
    isPostSurvey: boolean,
    delayRange?: { max: number; min: number },
  ): number {
    if (isPostSurvey) return 0;

    const defaultDelay = 10;
    const hasValidRange = delayRange?.min && delayRange?.max;

    // Use cryptographically secure random number generator
    const delaySeconds = hasValidRange
      ? randomInt(delayRange.min, delayRange.max + 1)
      : defaultDelay;

    return delaySeconds * 1000;
  }

  /**
   * Builds the conversation update object
   */
  private buildConversationUpdate(
    agentMessages: string[],
    agentTurns: number,
    agentSentMessages: number,
    now: number,
    consumerDelay: number,
    isPostSurvey: boolean,
    dialogType?: string,
    dialogId?: string,
  ): any {
    const toUpdate: any = {
      agentMessages,
      agentTurns,
      agentMessagesSentCount: agentSentMessages,
      lastAgentMessageTime: now,
      pendingConsumer: true,
      pendingConsumerRespondTime: now + consumerDelay,
      queued: true,
      ...(isPostSurvey && { active: true }),
    };

    if (dialogType) toUpdate.dialogType = dialogType;

    if (dialogId) toUpdate.dialogId = dialogId;

    return toUpdate;
  }

  /**
   * Calculates comprehensive task progress metrics for simulation monitoring and control.
   *
   * This method performs real-time analysis of task execution state by examining all associated
   * conversations and computing key performance indicators. It provides essential metrics for
   * determining whether new conversations should be initiated, tasks should be concluded, or
   * resources should be reallocated.
   *
   * The progress calculation includes:
   * - **Active conversations**: Currently open and in-progress conversations
   * - **Completed conversations**: Successfully concluded conversation sessions
   * - **Pending conversations**: Conversations awaiting consumer responses
   * - **Capacity analysis**: Available slots for new conversations based on concurrency limits
   * - **Completion assessment**: Task completion status and remaining work
   *
   * Key metrics computed:
   * - Total conversation records created
   * - In-flight conversations (active and consuming resources)
   * - Remaining conversation capacity before task completion
   * - Queue capacity for new conversations based on concurrency limits
   * - Task completion status and readiness for conclusion
   *
   * @param task - The simulation task object containing configuration and current state
   * @returns Promise resolving to comprehensive progress metrics object, or null if data unavailable
   *
   */
  async getTaskProgress(task: TaskStatus): Promise<TaskProgress | null> {
    const { accountId, requestId: taskId, maxConversations } = task;

    const conversations = await this.cache.getConversationsByRequestId(
      accountId,
      taskId,
    );

    if (!conversations) {
      this.logger.warn({
        message: `No conversations found for task ${taskId}`,
        accountId,
        service: ConnectorAPIService.name,
        function: 'getTaskProgress',
      });

      return null;
    }

    const pendingConversations = conversations.filter(
      (c) => c.pendingConsumer && c.pendingConsumerRespondTime >= Date.now(),
    ).length;

    const completedConversations = conversations.filter(
      (c) => c.status === CONVERSATION_STATE.CLOSE,
    ).length;

    const inflightConversations = conversations.filter(
      (c) => c.status === CONVERSATION_STATE.OPEN,
    ).length;

    // ----

    const remainingConversations =
      maxConversations - (completedConversations + inflightConversations);

    const maxAdditionalConversations =
      task.concurrentConversations - inflightConversations;

    const conversationsToQueue = Math.min(
      remainingConversations,
      maxAdditionalConversations,
    );

    const payload: {
      completedConversations: number;
      conversationsToQueue: number;
      inflightConversations: number;
      isComplete: boolean;
      maxAdditionalConversations: number;
      maxConversations: number;
      pendingConversations: number;
      queuedConversations?: number;
      remainingConversations: number;
      totalConversationRecords: number;
    } = {
      pendingConversations,
      totalConversationRecords: conversations.length,
      inflightConversations,
      completedConversations,
      remainingConversations,
      maxConversations,
      isComplete: completedConversations >= maxConversations,
      conversationsToQueue: conversationsToQueue,
      maxAdditionalConversations,
    };

    return payload;
  }

  /**
   * Determines and executes the next appropriate action for task progression based on current progress metrics.
   *
   * This method implements the core decision-making logic for simulation task management, analyzing current
   * task progress to determine whether to initiate new conversations, conclude the simulation, or trigger
   * analysis workflows. It serves as the central orchestrator for task lifecycle management and resource
   * allocation optimization.
   *
   * Decision matrix and actions:
   * - **Simulation completion**: When no conversations are in-flight and no remaining capacity exists
   *   - Transitions task to agent analysis phase
   *   - Triggers comprehensive task conclusion workflow
   *   - Initiates conversation assessment and scoring processes
   *
   * - **Capacity available**: When conversations can be queued within concurrency limits
   *   - Initiates new conversation creation process
   *   - Respects concurrency limits and resource constraints
   *   - Maintains optimal conversation distribution
   *
   * - **No action required**: When task is at optimal capacity or waiting for completions
   *
   * The method ensures:
   * - Proper task state transitions and lifecycle management
   * - Optimal resource utilization without overwhelming the system
   * - Comprehensive error handling for task conclusion processes
   * - Detailed logging for monitoring and debugging
   *
   * @param task - The simulation task object containing configuration and current state
   * @param progress - Current progress metrics calculated from active conversations
   *
   * @example
   * ```typescript
   * const progress = await connectorService.getTaskProgress(task);
   * await connectorService.nextAction(task, progress);
   * // Task will either conclude, start new conversations, or remain in current state
   * ```
   */
  async nextAction(task: TaskStatus, progress: TaskProgress) {
    const { accountId, requestId: taskId } = task;

    const {
      conversationsToQueue,
      remainingConversations,
      inflightConversations,
    } = progress;

    if (
      SIMULATION_STATUS.IN_PROGRESS &&
      inflightConversations === 0 &&
      remainingConversations <= 0
    ) {
      /*  SIMULATION COMPLETED */
      const info = {
        inFlightConversations: 0,
        conversationIds: [],
        completedConvIds: [],
        status: SIMULATION_STATUS.AGENT_ANALYSIS,
      };

      await this.databaseService.updateTask(accountId, taskId, info, []);

      try {
        await this.analysisService.concludeTask(accountId, task);
      } catch (error) {
        this.logger.error({
          message: `Error concluding task ${taskId} for account ${accountId}`,
          accountId,
          taskId,
          service: ConnectorAPIService.name,
          function: 'nextAction',
          error,
        });
      }

      return;
    }

    if (SIMULATION_STATUS.IN_PROGRESS && conversationsToQueue > 0) {
      await this.conversationSimulatorService.processNextSimulations(task, 1);
    }
  }

  /**
   * Processes LivePerson platform exchange events to manage conversation lifecycle transitions.
   *
   * This method handles critical conversation state changes communicated through LivePerson's
   * exchange event system. It specifically monitors for conversation closure events and dialog
   * transitions, enabling proper simulation flow control and post-conversation survey management.
   *
   * The method processes two primary event scenarios:
   * 1. **Complete conversation closure**: When stage reaches 'CLOSE' state
   * 2. **Dialog transitions**: When conversations move to post-survey states
   *
   * Key event processing logic:
   * - Validates events belong to simulation conversations (ignores non-simulation traffic)
   * - Handles conversation completion and triggers conclusion workflows
   * - Manages dialog transitions for post-conversation surveys
   * - Updates conversation states in cache and persistent storage
   * - Triggers new conversation creation when capacity becomes available
   * - Maintains conversation dialog ID tracking for proper survey flow
   *
   * Event types handled:
   * - **STAGE: CLOSE** - Complete conversation termination, triggers analysis and new conversation creation
   * - **Dialog state changes** - Post-survey dialog transitions and ID updates
   *
   * @param accountId - The LivePerson account identifier for data isolation
   * @param data - Exchange event payload containing conversation state changes
   *
   * @example
   * ```typescript
   * // Called by webhook handler when LP sends exchange events
   * await connectorService.exChangeEvent(accountId, exchangeEventData);
   * ```
   */
  async ExConversationChangeNotification(
    accountId: string,
    data: ExChangeEvent,
  ) {
    const function_ = 'ExConversationChangeNotification';

    /**
     * if stage === 'CLOSE':
     *   - completedConversations increased by 1
     *   - remove conversation from cache
     *   - update task request
     *   - start a new simulation if there are more conversations to be completed
     *
     * if state === 'CLOSE' but state !== 'CLOSE':
     *   - update dialogId (dialogType === 'POST_SURVEY')
     *   - if survey times out it should be picked up by future exchange events
     */
    for (const change of data.body.changes) {
      const conversationId = change?.result?.convId;

      if (!conversationId) {
        continue;
      }

      const record = await this.databaseService.getConversation(
        accountId,
        conversationId,
      );

      if (!record) {
        /**
         * IMPORTANT:
         * If there is no record, it means it is not a simulation conversation
         * and we should not process it here.
         * This is to avoid processing non-simulation conversations
         */
        continue;
      }

      const details = change?.result?.conversationDetails;

      if (!details) {
        this.logger.error({
          fn: function_,
          level: 'error',
          message: 'Conversation details not found',
          accountId,
          conversationId,
        });

        continue;
      }

      /**
       * STAGE CLOSE: means the conversation is closed
       * and we should conclude it (begin conversation assessment).
       */
      if (details.stage === CONVERSATION_STATE.CLOSE) {
        await this.conversationSimulatorService.concludeConversation(
          accountId,
          conversationId,
          record.requestId,
        );

        await this.cache.updateConversation(accountId, conversationId, {
          status: CONVERSATION_STATE.CLOSE,
          stage: CONVERSATION_STATE.CLOSE,
          active: false,
        });

        const task = await this.databaseService.getTask(
          accountId,
          record.requestId,
        );

        const progress = await this.getTaskProgress(task);

        this.nextAction(task, progress);
        // request new conversation

        return;
      } else {
        /**
         * Check for an open dialog of type POST_SURVEY
         */
        const openDialog = details.dialogs.find(
          (dialog: any) => dialog.state === CONVERSATION_STATE.OPEN,
        );

        if (openDialog?.dialogId !== record?.dialogId) {
          await this.cache.updateConversation(accountId, conversationId, {
            dialogType: openDialog?.dialogType,
            dialogId: openDialog?.dialogId,
            stage: details.stage as CONVERSATION_STATE,
          });

          await this.databaseService.updateConversation(
            accountId,
            conversationId,
            {
              dialogType: openDialog?.dialogType,
              dialogId: openDialog?.dialogId,
              stage: details.stage as CONVERSATION_STATE,
            },
          );
        }
      }
    }
  }

  /**
   * Orchestrates the complete conversation conclusion workflow including analysis and task progression.
   *
   * This method manages the final phase of conversation lifecycle, transitioning conversations from
   * active state to analysis phase while maintaining proper task accounting and triggering downstream
   * processing workflows. It ensures data consistency across distributed systems and handles the
   * complex state transitions required for proper simulation conclusion.
   *
   * The conclusion process involves:
   * - **State transition**: Moving conversation to analysis phase
   * - **Task accounting**: Updating completed conversation counts and tracking
   * - **Cache synchronization**: Ensuring distributed cache consistency
   * - **Analysis triggering**: Initiating conversation assessment workflows
   * - **Duplicate handling**: Preventing multiple conclusion processes for same conversation
   * - **Resource cleanup**: Proper resource deallocation and state cleanup
   *
   * Key responsibilities:
   * - Maintains conversation completion tracking to prevent duplicate processing
   * - Updates task progress counters for accurate simulation monitoring
   * - Triggers analysis service for conversation assessment and scoring
   * - Ensures proper error handling for failed conclusion attempts
   * - Provides comprehensive logging for debugging and monitoring
   *
   * @param accountId - The LivePerson account identifier for data isolation and security
   * @param conversationId - Unique identifier of the conversation being concluded
   * @param requestId - Task identifier for proper accounting and progress tracking
   *
   * @example
   * ```typescript
   * // Called when conversation reaches final state
   * await connectorService.concludeConversation(accountId, conversationId, requestId);
   * ```
   */
  async concludeConversation(
    accountId: string,
    conversationId: string,
    requestId: string,
  ) {
    try {
      const conversation = await this.cache.getConversation(
        accountId,
        conversationId,
      );

      if (!conversation) {
        this.logger.error({
          level: 'error',
          message: 'Conversation not found',
          accountId,
          conversationId,
          requestId,
        });

        return;
      }

      conversation.state = CONVERSATION_SIMULATION_STATES.ANALYSING;

      await this.cache.updateConversation(
        accountId,
        conversationId,
        conversation,
      );

      const task = await this.cache.getTask(accountId, requestId);

      if (!task) {
        this.logger.error({
          level: 'error',
          message: 'Task not found',
          accountId,
          conversationId,
          requestId,
        });

        return;
      }

      const completedConvIds = task?.completedConvIds || [];

      if (completedConvIds.includes(conversationId)) {
        this.logger.error({
          level: 'info',
          message: 'Conversation already completed',
          accountId,
          conversationId,
          completedConversations: task.completedConversations,
        });

        return;
      }

      if (!task) {
        this.logger.error({
          level: 'error',
          message: 'Request cache not found',
          accountId,
          conversationId,
        });

        return;
      }

      if (!completedConvIds.includes(conversationId))
        completedConvIds.push(conversationId);

      await this.cache.updateTask(accountId, requestId, {
        completedConvIds,
        completedConversations: task.completedConversations + 1,
      });

      await this.conversationSimulatorService.concludeConversation(
        accountId,
        conversationId,
        requestId,
      );
    } catch (error) {
      this.logger.error({
        level: 'error',
        message: 'Error concluding conversation',
        accountId,
        conversationId,
        requestId,
        error,
      });
    }
  }
}
