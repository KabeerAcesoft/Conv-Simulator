import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { randomInt } from 'crypto';

import { ScenarioDto } from 'src/Controllers/Database/database.dto';
import { helper } from 'src/utils/HelperService';

import { AIStudioService } from '../../AIStudio/ai-studio.service';
import { CacheService } from '../../Cache/cache.service';
import { AppConfigurationService } from '../../Configuration/configuration.service';
import { ConnectorAPIService } from '../../ConnectorAPI/connector-api.service';
import { PersistentIdentityDto } from '../../Database/database.dto';
import { DatabaseService } from '../../Database/database.service';
import { SimulationConversation, TaskStatus } from '../simulation.dto';

import { BaseConversationCreator } from './base-conversation-creator';
import {
  IConversationHandler,
  MessageResponse,
} from './conversation-handler.interface';

const insertCCBearer = helper.insertCCBearer.bind(helper);
const context_ = helper.ctx.bind(helper);
const fillPrompt = helper.fillPrompt.bind(helper);
const context = '[InternalConversationHandler]';

@Injectable()
export class InternalConversationHandler implements IConversationHandler {
  constructor(
    @InjectPinoLogger(InternalConversationHandler.name)
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

    const {
      requestId,
      accountId,
      brandName: brand_name,
      useFakeNames,
      scenarios,
      personas,
      identities,
    } = task;

    try {
      // Validate required data
      if (
        (!personas || personas.length === 0) &&
        (!identities || identities.length === 0)
      ) {
        throw new InternalServerErrorException(
          'No personas found for task, review your configuration and resolve any issues before retrying.',
        );
      }

      if (!scenarios || scenarios.length === 0) {
        throw new InternalServerErrorException(
          'No scenarios found for task, review your configuration and resolve any issues before retrying.',
        );
      }

      // Get identity or persona
      const identityOrPersona = await this.getIdentityOrPersona(
        accountId,
        personas,
        identities,
      );

      if (!identityOrPersona) {
        this.logger.info({
          fn: function_,
          message:
            'No available identities or personas found, skipping conversation creation',
          accountId,
          requestId,
          totalPersonas: personas?.length || 0,
          totalIdentities: identities?.length || 0,
        });

        return null; // Skip conversation creation - will be retried when a conversation closes
      }

      const {
        identity,
        persona: persona_,
        personaId,
        personaName,
      } = identityOrPersona;

      // Get random scenario
      const { scenario, scenarioId, scenarioName } =
        (await this.databaseService.getRandomScenario(task)) || {};

      if (!scenario) {
        throw new InternalServerErrorException('No scenario found');
      }

      // Generate customer details
      const customerDetails = this.baseCreator.generateCustomerDetails(
        identity,
        useFakeNames,
      );

      const skillId = Number(scenario?.skill?.id);

      // Setup conversation prerequisites
      const setup = await this.baseCreator.setupConversationPrerequisites(
        task,
        customerDetails,
        skillId,
      );

      let persona = persona_;

      if (identity?.profile) {
        persona =
          'Customer Profile Info: ' + identity?.profile + '\n' + persona;
      }

      // Generate first response using internal flow
      const firstMessage = await this.getFirstResponse(
        task,
        '',
        setup.aisConversationId,
        brand_name,
        customerDetails.customer_name,
        persona,
        scenario,
        identity,
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
          scenarioId,
          personaId,
          identity,
        );

      // Create conversation payload with scenario and persona data
      const criteriaList =
        scenario?.successCriteria
          ?.map((criteria) => '- ' + criteria.value)
          .join('\n') || '';

      const scenarioText = scenario
        ? scenario.scenario + '\n' + criteriaList
        : '';

      const payload = this.baseCreator.createConversationPayload(
        task,
        conversationId,
        setup,
        scenarioId,
        scenarioName,
        personaId,
        personaName,
        identity,
        {
          // additional prompt variables
          scenario: scenarioText,
          persona,
          scenario_name: scenario?.topic || '',
          scenario_criteria: scenario?.successCriteria || '',
        },
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
        message: `Error creating internal conversation for account ${accountId}`,
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

      // If error already has structured response data (e.g., from APIService), preserve it
      if (error.response) {
        throw error; // Re-throw the original exception with its response data
      }

      // Otherwise, create a new exception with meaningful message
      const errorMessage = error.message || String(error);

      throw new InternalServerErrorException(
        ...context_(context, function_, errorMessage),
      );
    }
  }

  async getFirstResponse(
    task: TaskStatus,
    conversationId: string,
    aisConversationId: string,
    brand_name: string,
    customer_name: string,
    persona: string,
    scenario: ScenarioDto,
    identity?: PersistentIdentityDto,
  ): Promise<MessageResponse | null> {
    const function_ = 'getFirstResponse';
    const { requestId, accountId, flowId } = task;

    try {
      if (!requestId || !accountId || !brand_name || !flowId) {
        this.logger.error({
          fn: function_,
          message: `Missing required fields`,
          requestId,
          accountId,
          brand_name,
          flowId,
        });

        throw new BadRequestException(`Missing required fields`);
      }

      const flow_id = flowId;

      // successCriteria is an array of { value: string; required?: boolean }. must be mapped as string only referencing value field
      const criteriaList = scenario?.successCriteria
        ? scenario.successCriteria
            .map((criteria) => '- ' + criteria.value)
            .join('\n')
        : '';

      const scenarioText = scenario
        ? `${scenario.scenario}\n${criteriaList}`
        : '';

      const identityProperties: {
        customerId?: string;
        customerType?: string;
        description?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        profile?: string;
      } = {};

      // raw text profile info
      let profileInfo = 'Customer Profile Info: \n';

      if (identity?.profile) {
        identityProperties.profile = identity.profile;
        profileInfo += identity.profile + '\n';
      }

      if (identity?.customerId) {
        identityProperties.customerId = identity.customerId;
        profileInfo += 'Customer ID: ' + identity.customerId + '\n';
      }

      if (identity?.customerType) {
        identityProperties.customerType = identity.customerType;
        profileInfo += 'Customer Type: ' + identity.customerType + '\n';
      }

      if (identity?.description) {
        identityProperties.description = identity.description;
        profileInfo += 'Description: ' + identity.description + '\n';
      }

      if (identity?.email) {
        identityProperties.email = identity.email;
        profileInfo += 'Email: ' + identity.email + '\n';
      }

      if (identity?.firstName) {
        identityProperties.firstName = identity.firstName;
        profileInfo += 'First Name: ' + identity.firstName + '\n';
      }

      if (identity?.lastName) {
        identityProperties.lastName = identity.lastName;
        profileInfo += 'Last Name: ' + identity.lastName + '\n';
      }

      if (identity?.phone) {
        identityProperties.phone = identity.phone;
        profileInfo += 'Phone: ' + identity.phone + '\n';
      }

      const response = await this.generateMessage(
        task,
        {
          aisConversationId,
          flowId: flow_id,
          accountId,
          promptVariables: {
            scenario_name: scenario?.topic || '',
            customer_name,
            brand_name,
            scenario_criteria: scenario?.successCriteria || '',
            scenario: scenarioText,
            persona,
            ...identityProperties,
            customer_profile: profileInfo,
          },
        },
        'start',
      );

      return response;
    } catch (error) {
      this.logger.trace({
        fn: function_,
        message: `Error getting first response for internal flow`,
        task: task.requestId,
        aisConversationId,
        error,
      });

      throw new InternalServerErrorException({
        fn: '[InternalConversationHandler]: getFirstResponse',
        error,
      });
    }
  }

  async generateMessage(
    task: TaskStatus,
    conversation: Partial<SimulationConversation>,
    message: string,
  ): Promise<MessageResponse> {
    const function_ = 'generateMessage';
    const { accountId } = task;
    const { promptVariables } = conversation;

    // try {
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

    // Get base prompt for internal simulation
    const promptId = task.prompts.syntheticCustomer;

    const basePrompt = await this.databaseService.getPrompt(
      accountId,
      promptId,
      true,
    );

    if (!basePrompt) {
      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `No application settings found for account ${accountId}`,
        ),
      );
    }

    const { ...additionalVariables } = promptVariables || {};

    // Fill prompt with all variables
    const prompt = fillPrompt(basePrompt, {
      ...promptVariables,
      ...additionalVariables,
    });

    // Get response from AI Studio flow
    const response = await this.aiStudioService.getFlowResponse({
      accountId,
      conv_id: conversation.aisConversationId,
      flow_id: conversation.flowId,
      token: insertCCBearer(token),
      prompt,
      text: message,
    });

    return response;
    // } catch (error) {
    //   this.logger.error({
    //     fn: function_,
    //     message: `Error generating internal message for account ${accountId}`,
    //     conversationId: conversation.id,
    //     error,
    //   });

    //   throw new InternalServerErrorException(
    //     ...context_(
    //       context,
    //       function_,
    //       'Error generating internal message',
    //       error,
    //     ),
    //   );
    // }
  }

  /**
   * Handles case when only personas are available
   */
  private async handlePersonaOnly(
    personas: string[],
    accountId: string,
  ): Promise<{
    persona: string;
    personaId: string;
    type: 'identity' | 'persona';
  }> {
    const { personaId, persona } = await this.getRandomPersona(
      personas,
      accountId,
    );

    return { personaId, persona, type: 'persona' };
  }

  /**
   * Handles case when only identities are available
   */
  private async handleIdentityOnly(
    accountId: string,
    identities: string[],
  ): Promise<{
    identity: PersistentIdentityDto;
    identityId: string;
    persona: string;
    personaId: string;
    type: 'identity' | 'persona';
  } | null> {
    const availableIdentity = await this.baseCreator.findAvailableIdentity(
      accountId,
      identities,
      this.databaseService,
      this.cache,
    );

    if (!availableIdentity) {
      return null;
    }

    const { identityId, identity } = availableIdentity;

    const { persona } = await this.databaseService.getPersonaById(
      accountId,
      identity.personaId,
    );

    if (!persona) {
      throw new InternalServerErrorException('No persona found for identity');
    }

    return {
      personaId: identity.personaId,
      persona,
      identityId,
      identity,
      type: 'identity',
    };
  }

  /**
   * Retrieves persona data for an identity
   */
  private async getPersonaForIdentity(
    accountId: string,
    identity: PersistentIdentityDto,
  ): Promise<{ persona: string; personaName?: string }> {
    const { persona, personaName } = await this.databaseService.getPersonaById(
      accountId,
      identity.personaId,
    );

    if (!persona) {
      throw new InternalServerErrorException(
        'No persona found for identity; check your identity configuration and ensure all identities reference a valid persona.',
      );
    }

    return { persona, personaName };
  }

  /**
   * Handles case when both personas and identities are available
   */
  private async handleBothAvailable(
    accountId: string,
    personas: string[],
    identities: string[],
  ): Promise<{
    identity?: PersistentIdentityDto;
    identityId?: string;
    persona: string;
    personaId: string;
    personaName?: string;
    type: 'identity' | 'persona';
  }> {
    const availableIdentity = await this.baseCreator.findAvailableIdentity(
      accountId,
      identities,
      this.databaseService,
      this.cache,
    );

    if (availableIdentity) {
      const { identityId, identity } = availableIdentity;

      const { persona, personaName } = await this.getPersonaForIdentity(
        accountId,
        identity,
      );

      return {
        personaId: identity.personaId,
        persona,
        personaName,
        identityId,
        identity,
        type: 'identity',
      };
    }

    // Fall back to persona
    const { personaId, persona } = await this.getRandomPersona(
      personas,
      accountId,
    );

    if (!persona) {
      throw new InternalServerErrorException(
        'No persona found, check your configuration settings and resolve any issues before retrying.',
      );
    }

    return { personaId, persona, type: 'persona' };
  }

  private async getIdentityOrPersona(
    accountId: string,
    personas: string[],
    identities: string[],
  ): Promise<{
    identity?: PersistentIdentityDto;
    identityId?: string;
    persona: string;
    personaId: string;
    personaName?: string;
    type: 'identity' | 'persona';
  } | null> {
    const personasLength = personas ? personas.length : 0;
    const identitiesLength = identities ? identities.length : 0;

    if (personasLength === 0 && identitiesLength === 0) {
      throw new InternalServerErrorException(
        'No personas or identities provided. Review your configuration and resolve any issues before retrying.',
      );
    }

    if (personasLength > 0 && identitiesLength === 0) {
      return await this.handlePersonaOnly(personas, accountId);
    }

    if (identitiesLength > 0 && personasLength === 0) {
      return await this.handleIdentityOnly(accountId, identities);
    }

    // Both available
    return await this.handleBothAvailable(accountId, personas, identities);
  }

  private async getRandomPersona(
    personas: string[],
    accountId: string,
  ): Promise<{ persona: string; personaId: string }> {
    const personasLength = personas ? personas.length : 0;

    if (personasLength === 0) {
      throw new InternalServerErrorException('No personas provided');
    }

    const randomIndex = randomInt(personasLength);
    const id = personas.at(randomIndex);

    if (!id) {
      throw new InternalServerErrorException('Invalid persona index');
    }

    const { persona } = await this.databaseService.getPersonaById(
      accountId,
      id,
    );

    if (!persona) {
      throw new InternalServerErrorException('No persona found');
    }

    return { personaId: id, persona };
  }
}
