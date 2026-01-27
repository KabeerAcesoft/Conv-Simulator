import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { randomInt } from 'crypto';

import { randomName } from 'src/utils/consumer_names';
import { helper } from 'src/utils/HelperService';

import { AIStudioService } from '../../AIStudio/ai-studio.service';
import { AppConfigurationService } from '../../Configuration/configuration.service';
import { ConnectorAPIService } from '../../ConnectorAPI/connector-api.service';
import { PersistentIdentityDto } from '../../Database/database.dto';
import { ConversationRequest, TaskStatus } from '../simulation.dto';

const insertCCBearer = helper.insertCCBearer.bind(helper);

export interface CustomerDetails {
  firstName: string;
  lastName: string;
  email?: string;
  consumerName: string;
  customerId?: string;
  phone?: string;
  customer_name: string;
  profile?: string;
  customerType?: string;
}

export interface ConversationSetupResult {
  appJwt: string;
  consumerToken: string;
  aisConversationId: string;
  customerDetails: CustomerDetails;
}

@Injectable()
export class BaseConversationCreator {
  constructor(
    @InjectPinoLogger(BaseConversationCreator.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => ConnectorAPIService))
    private readonly connectorAPI: ConnectorAPIService,
    @Inject(forwardRef(() => AppConfigurationService))
    private readonly appConfigService: AppConfigurationService,
    private readonly aiStudioService: AIStudioService,
  ) {}

  /**
   * Generates customer details based on identity or fake names
   */
  generateCustomerDetails(
    identity?: PersistentIdentityDto,
    useFakeNames?: boolean,
  ): CustomerDetails {
    if (identity) {
      return {
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        consumerName: `${identity.firstName} ${identity.lastName}`,
        customerId: identity.customerId,
        phone: identity.phone,
        customer_name: `name: ${identity.firstName} ${identity.lastName}`,
        profile: identity.profile || '',
        customerType: identity.customerType || '',
      };
    }

    const consumerName = useFakeNames ? randomName() : 'Anonymous Customer';
    const firstName = consumerName ? consumerName.split(' ')[0] : 'Anonymous';
    const lastName = consumerName ? consumerName.split(' ')[1] : 'Customer';
    const customer_name = `name: ${consumerName}`;

    return {
      firstName,
      lastName,
      consumerName,
      customer_name,
    };
  }

  /**
   * Sets up common conversation prerequisites (tokens, AI Studio conversation)
   */
  async setupConversationPrerequisites(
    task: TaskStatus,
    customerDetails: CustomerDetails,
    skillId: number,
  ): Promise<ConversationSetupResult> {
    const { accountId, flowId } = task;

    // Get authentication tokens
    const token = await this.appConfigService.getTokenWithFallback(accountId);

    if (!token) {
      throw new Error(`No token found for account ${accountId}`);
    }

    const appJwt = await this.connectorAPI.getAppJwt(accountId);

    const consumerJWS = await this.connectorAPI.getConsumerJWT(
      accountId,
      appJwt,
      customerDetails.customerId || undefined,
    );

    if (!consumerJWS) {
      throw new Error(`No consumer JWS found for account ${accountId}`);
    }

    // Start AI Studio conversation
    const aisbody = {
      flow_id: flowId,
      saved: true,
      source: 'SIMULATION',
      conversation_cloud_skill_id: String(skillId),
      conversation_cloud_rest_api: false,
    };

    const { id: aisConversationId } =
      await this.aiStudioService.startConversation(
        accountId,
        insertCCBearer(token),
        aisbody,
      );

    return {
      appJwt,
      consumerToken: consumerJWS.consumer_token,
      aisConversationId,
      customerDetails,
    };
  }

  /**
   * Creates the conversation payload object
   */
  createConversationPayload(
    task: TaskStatus,
    conversationId: string,
    setup: ConversationSetupResult,
    scenarioId?: string,
    scenarioName?: string,
    personaId?: string,
    personaName?: string,
    identity: PersistentIdentityDto | undefined = undefined,
    additionalPromptVariables?: Record<string, any>,
  ): ConversationRequest {
    this.logger.debug({
      message: 'Creating conversation payload',
      scenarioName: scenarioName || null,
      personaName: personaName || null,
    });

    const {
      accountId,
      requestId,
      brandName: brand_name,
      flowId,
      syntheticCustomerflowId,
    } = task;

    const { customerDetails, aisConversationId, consumerToken } = setup;

    const basePromptVariables: {
      brand_name: string;
      consumerName: string;
      customer_name: string;
      customer_type?: string;
      email: string;
      phone: string;
    } = {
      brand_name,
      consumerName: customerDetails.consumerName,
      customer_name: customerDetails.customer_name,
      email: customerDetails.email || '',
      phone: customerDetails.phone || '',
    };

    if (identity) {
      /* use email, name, etc from identity if available */
      if (identity.email) {
        basePromptVariables.email = identity.email;
        customerDetails.email = identity.email;
      }

      if (identity.phone) {
        basePromptVariables.phone = identity.phone;
        customerDetails.phone = identity.phone;
      }

      if (identity.customerType) {
        basePromptVariables.customer_type = identity.customerType;
      }

      if (identity.firstName && identity.lastName) {
        basePromptVariables.consumerName = `${identity.firstName} ${identity.lastName}`;
        basePromptVariables.customer_name = `name: ${identity.firstName} ${identity.lastName}`;
      }
    }

    return new ConversationRequest({
      accountId,
      aisConversationId,
      createdBy: task.createdBy,
      createdAt: Date.now(),
      id: conversationId,
      requestId,
      consumerName: customerDetails.consumerName,
      consumerToken,
      flowId,
      syntheticCustomerflowId,
      scenario: scenarioId,
      scenarioName: scenarioName || '',
      personaName: personaName || '',
      persona: personaId,
      customerId: identity?.customerId || null,
      agentTurns: 0,
      customerTurns: 1,
      promptVariables: {
        ...basePromptVariables,
        ...additionalPromptVariables,
      },
      skillId: task.skillId,
    });
  }

  /**
   * Creates the LivePerson conversation and returns the conversation ID
   */
  async createLivePersonConversation(
    task: TaskStatus,
    appJwt: string,
    consumerToken: string,
    skillId: number,
    customerDetails: CustomerDetails,
    scenarioId?: string,
    personaId?: string,
    identity?: PersistentIdentityDto,
  ): Promise<string> {
    const { conversationId } =
      await this.connectorAPI.sendCreateConversationRequest(
        task,
        appJwt,
        consumerToken,
        skillId,
        {
          firstName: customerDetails.firstName,
          lastName: customerDetails.lastName,
        },
        scenarioId,
        personaId,
        identity,
      );

    if (!conversationId) {
      throw new Error(
        `Failed to create conversation for account ${task.accountId}`,
      );
    }

    return conversationId;
  }

  /**
   * Checks if a specific identity is currently being used in any active conversations
   */
  async isIdentityInUse(
    accountId: string,
    customerId: string,
    databaseService: any,
    cache: any,
  ): Promise<boolean> {
    try {
      // Check both cache and database for active conversations using this customerId
      const [cachedConversations, databaseConversations] = await Promise.all([
        cache.getActiveConversationsByCustomerId(accountId, customerId),
        databaseService.getActiveConversationsByCustomerId(
          accountId,
          customerId,
        ),
      ]);

      // If either cache or database has active conversations with this customerId, it's in use
      const hasActiveConversations =
        (cachedConversations && cachedConversations.length > 0) ||
        (databaseConversations && databaseConversations.length > 0);

      return hasActiveConversations;
    } catch (error) {
      // If we can't determine usage, assume it's not in use to avoid blocking
      this.logger.warn({
        message: 'Error checking identity usage, assuming available',
        accountId,
        customerId,
        error,
      });

      return false;
    }
  }

  /**
   * Finds an available identity from the provided list that is not currently in use
   */
  async findAvailableIdentity(
    accountId: string,
    identityIds: string[],
    databaseService: any,
    cache: any,
  ): Promise<{ identity: any; identityId: string } | null> {
    if (!identityIds || identityIds.length === 0) {
      return null;
    }

    // Shuffle the identities to avoid always picking the same one
    const shuffledIdentityIds = [...identityIds].sort(
      () => randomInt(-1, 2) - 0.5,
    );

    for (const identityId of shuffledIdentityIds) {
      try {
        const identity = await databaseService.getIdentity(
          accountId,
          identityId,
        );

        if (!identity?.customerId) {
          continue; // Skip if identity doesn't exist or doesn't have a customerId
        }

        const isInUse = await this.isIdentityInUse(
          accountId,
          identity.customerId,
          databaseService,
          cache,
        );

        if (!isInUse) {
          this.logger.debug({
            message: 'Found available identity',
            accountId,
            identityId,
            customerId: identity.customerId,
          });

          return { identityId, identity };
        } else {
          this.logger.debug({
            message: 'Identity is currently in use, skipping',
            accountId,
            identityId,
            customerId: identity.customerId,
          });
        }
      } catch (error) {
        this.logger.warn({
          message: 'Error checking identity availability, skipping',
          accountId,
          identityId,
          error,
        });

        continue;
      }
    }

    this.logger.info({
      message: 'No available identities found',
      accountId,
      totalIdentities: identityIds.length,
    });

    return null;
  }
}
