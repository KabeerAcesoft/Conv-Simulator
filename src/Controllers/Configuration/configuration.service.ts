import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CollectionReference } from '@google-cloud/firestore';

import { PromptConfigurationDto } from 'src/constants/common.dtos';
import { UserDto } from 'src/Controllers/AccountConfig/account-config.dto';
import { encrypt } from 'src/utils/encryption';
import { helper } from 'src/utils/HelperService';

import { AccountConfigService } from '../AccountConfig/account-config.service';
import { AIStudioService } from '../AIStudio/ai-studio.service';
import { CacheService } from '../Cache/cache.service';
import { ScenarioDto } from '../Database/database.dto';

import {
  ApplicationSettingsDto,
  Influence,
  InfluencesDto,
  PersonaDto,
  ServiceWorkerConfigDto,
  ServiceWorkerDto,
  SimulationCategory,
  SimulationConfigurationDto,
  SimulationPromptDto,
} from './configuration.dto';

const { ctx } = helper;

export const context = '[SimulationDBService]';

@Injectable()
export class AppConfigurationService {
  constructor(
    @InjectPinoLogger(AppConfigurationService.name)
    private readonly logger: PinoLogger,
    @Inject(ScenarioDto.collectionName)
    private scenarioCollection: CollectionReference<ScenarioDto>,
    @Inject(PersonaDto.collectionName)
    private personaCollection: CollectionReference<PersonaDto>,
    @Inject(SimulationCategory.collectionName)
    private categoryCollection: CollectionReference<SimulationCategory>,
    @Inject(InfluencesDto.collectionName)
    private influencesCollection: CollectionReference<InfluencesDto>,
    @Inject(ApplicationSettingsDto.collectionName)
    private applicationSettingsCollection: CollectionReference<ApplicationSettingsDto>,
    @Inject(SimulationConfigurationDto.collectionName)
    private simulationConfigurationCollection: CollectionReference<SimulationConfigurationDto>,
    @Inject(SimulationPromptDto.collectionName)
    private promptCollection: CollectionReference<SimulationPromptDto>,
    private configService: ConfigService,
    @Inject(ServiceWorkerDto.collectionName)
    private serviceWorkerCollection: CollectionReference<ServiceWorkerDto>,
    private cacheService: CacheService,
    private accountConfigService: AccountConfigService,
    private aiStudioService: AIStudioService,
  ) {
    this.logger.setContext(context);
  }

  async getSimulationConfigurations(
    accountId: string,
  ): Promise<SimulationConfigurationDto[]> {
    const function_ = 'getSimulationConfigurations';

    try {
      const snapshot = await this.simulationConfigurationCollection
        .where('accountId', '==', accountId)
        .get();

      const configurations: SimulationConfigurationDto[] = [];

      snapshot.forEach((document_) => {
        const config = document_.data();

        configurations.push(config);
      });

      return configurations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting simulation configurations',
        accountId,
      });

      throw new InternalServerErrorException(
        ctx(context, function_, 'Error getting simulation configurations'),
      );
    }
  }

  async getInfluences(
    accountId: string,
  ): Promise<{ influences: Influence[] } | null> {
    try {
      const databaseInfluencesItem = await this.influencesCollection
        .doc(accountId)
        .get();

      if (!databaseInfluencesItem.exists) {
        return null;
      }

      const data = databaseInfluencesItem.data();

      if (!data) {
        return null;
      }

      return data;
    } catch (error) {
      this.logger.error({
        fn: 'getInfluences',
        error,
        message: 'Error getting influences',
        accountId,
      });

      throw new InternalServerErrorException(
        ...ctx(context, 'getInfluences', 'Error getting influences'),
      );
    }
  }

  async getPersonas(accountId: string): Promise<PersonaDto[]> | null {
    const function_ = 'getPersonas';

    try {
      const personas: PersonaDto[] = [];

      const snapshot = await this.personaCollection
        .where('accountId', '==', accountId)
        .get();

      snapshot.forEach((document_) => {
        const persona = document_.data();

        personas.push(persona);
      });

      return personas;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting personas',
        accountId,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, 'Error getting personas'),
        accountId,
      );
    }
  }

  async getPersona(accountId: string, id: string): Promise<PersonaDto> | null {
    const function_ = 'getPersona';

    try {
      const databasePersonaItem = await this.personaCollection.doc(id).get();

      if (!databasePersonaItem.exists) {
        return null;
      }

      const databasePersona = databasePersonaItem.data();

      if (!databasePersona) {
        return null;
      }

      return databasePersona;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting persona',
        accountId,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, 'Error getting persona'),
        accountId,
      );
    }
  }

  async getCategories(accountId: string): Promise<SimulationCategory[]> | null {
    const categories: SimulationCategory[] = [];

    const snapshot = await this.categoryCollection
      .where('accountId', '==', accountId)
      .get();

    snapshot.forEach((document_) => {
      const category = document_.data();

      if (category.accountId === accountId) {
        categories.push(category);
      }
    });

    return categories;
  }

  async getScenarioCategories(accountId: string): Promise<string[]> | null {
    const snapshot = await this.scenarioCollection
      .where('accountId', '==', accountId)
      .get();

    const categories: string[] = [];

    snapshot.forEach((document_) => {
      const scenario = document_.data();

      if (scenario.category && !categories.includes(scenario.category)) {
        categories.push(scenario.category);
      }
    });

    return categories;
  }

  async getScenarios(accountId: string): Promise<ScenarioDto[]> | null {
    const snapshot = await this.scenarioCollection
      .where('accountId', '==', accountId)
      .get();

    const scenarios: ScenarioDto[] = [];

    snapshot.forEach((document_) => {
      const scenario = document_.data();

      if (scenario.accountId === accountId) {
        scenarios.push(scenario);
      }
    });

    return scenarios;
  }

  async getAccountScenarios(accountId: string): Promise<ScenarioDto[]> | null {
    const snapshot = await this.scenarioCollection
      .where('accountId', '==', accountId)
      .get();

    const scenarios: ScenarioDto[] = [];

    snapshot.forEach((document_) => {
      const scenario = document_.data();

      if (scenario.topicEnabled) {
        scenarios.push(scenario);
      }
    });

    return scenarios;
  }

  async getScenario(id: string): Promise<ScenarioDto> | null {
    const databaseScenarioItem = await this.scenarioCollection.doc(id).get();

    if (!databaseScenarioItem.exists) {
      return null;
    }

    const databaseScenario = databaseScenarioItem.data();

    if (!databaseScenario) {
      return null;
    }

    return databaseScenario;
  }

  async getApplicationSettings(
    accountId: string,
  ): Promise<ApplicationSettingsDto> {
    const function_ = 'getApplicationSettings';

    try {
      const existing = await this.applicationSettingsCollection
        .doc(accountId)
        .get();

      if (!existing.exists) {
        return {
          accountId,
          settings: [],
        } as ApplicationSettingsDto;
      }

      const settings = existing.data();

      return settings;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting application settings',
        accountId,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, error),
        accountId,
      );
    }
  }

  async getApplicationSettingsAll(): Promise<ApplicationSettingsDto[]> {
    const function_ = 'getAllApplicationSettings';

    try {
      const zone = this.configService.get<string>('ZONE') || 'default';

      const existing = await this.applicationSettingsCollection
        .where('zone.value', '==', zone)
        .get();

      const settings: ApplicationSettingsDto[] = [];

      existing.forEach((document_) => {
        const setting = document_.data();

        if (setting) {
          settings.push(setting);
        }
      });

      return settings;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting all application settings',
      });

      throw new InternalServerErrorException(...ctx(context, function_, error));
    }
  }

  async getPrompts(accountId: string): Promise<SimulationPromptDto[]> {
    const function_ = 'getPrompts';

    try {
      const promptsSnapshot = await this.promptCollection
        .where('accountId', '==', accountId)
        .get();

      if (promptsSnapshot.empty) {
        return [];
      }

      const prompts: SimulationPromptDto[] = [];

      promptsSnapshot.forEach((document_) => {
        const prompt = document_.data();

        if (prompt) {
          prompts.push(prompt);
        }
      });

      return prompts;
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error retrieving prompts',
        accountId,
        error,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, error),
        accountId,
      );
    }
  }

  async getTaskPrompts(
    accountId: string,
    prompts: PromptConfigurationDto,
  ): Promise<SimulationPromptDto[]> {
    const function_ = 'getTaskPrompts';

    try {
      const ids = Object.values(prompts).filter(
        (prompt) => prompt && prompt.length > 0,
      ) as string[];

      if (!ids || ids.length === 0) {
        this.logger.warn({
          fn: function_,
          message: `No prompt IDs provided for account ${accountId}`,
          accountId,
        });

        return [];
      }

      const promptsSnapshot = await this.promptCollection
        .where('accountId', '==', accountId)
        .where('id', 'in', ids)
        .get();

      if (promptsSnapshot.empty) {
        return [];
      }

      const taskPrompts: SimulationPromptDto[] = [];

      for (const document_ of promptsSnapshot.docs) {
        const prompt = document_.data();

        taskPrompts.push(prompt);
        await this.cacheService.setPrompt(accountId, prompt.id, prompt.prompt);
      }

      return taskPrompts;
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error retrieving task prompts',
        accountId,
        error,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, error),
        accountId,
      );
    }
  }

  async getPromptById(
    accountId: string,
    promptId: string,
  ): Promise<SimulationPromptDto | null> {
    const function_ = 'getPromptById';

    try {
      const promptDocument = await this.promptCollection.doc(promptId).get();

      if (!promptDocument.exists) {
        this.logger.error({
          fn: function_,
          message: `Prompt not found for account ${accountId} and promptId ${promptId}`,
          accountId,
          promptId,
        });

        return null;
      }

      const promptData = promptDocument.data();

      if (!promptData || promptData.accountId !== accountId) {
        this.logger.error({
          fn: function_,
          message: `Prompt not found for account ${accountId} and promptId ${promptId}`,
          accountId,
          promptId,
        });

        return null;
      }

      return promptData;
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error retrieving prompt by ID',
        accountId,
        promptId,
        error,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, error),
        accountId,
      );
    }
  }

  async getServiceWorker(
    accountId: string,
  ): Promise<ServiceWorkerConfigDto | null> {
    const worker = await this.serviceWorkerCollection.doc(accountId).get();

    if (!worker.exists) {
      this.logger.warn(
        ctx(context, 'getServiceWorker', {
          accountId,
          message: 'No service worker found for this account',
        }),
      );

      return null;
    }

    const workerData = worker.data();

    if (!workerData?.config) {
      this.logger.warn(
        ctx(context, 'getServiceWorker', {
          accountId,
          message: 'Service worker config is empty',
        }),
      );

      return null;
    }

    try {
      const decrypted = await helper.decrypt(workerData.config);
      const worker = JSON.parse(decrypted) as ServiceWorkerConfigDto;

      return worker;
    } catch (error) {
      this.logger.error(
        ctx(context, 'getServiceWorker', {
          accountId,
          message: 'Error decrypting service worker config',
          error: (error as Error).message,
        }),
      );

      throw new InternalServerErrorException(
        'Error decrypting service worker config',
      );
    }
  }

  async setServiceWorker(body: ServiceWorkerConfigDto): Promise<any> {
    const function_ = 'setServiceWorker';
    const { accountId } = body;

    try {
      const { bearer, sessionTTl } =
        await this.accountConfigService.userAPILogin(
          {
            id: body.id,
            username: body.username,
            appKey: body.appKey,
            secret: body.secret,
            accessToken: body.accessToken,
            accessTokenSecret: body.accessTokenSecret,
          },
          body.accountId,
        );

      if (!bearer) {
        this.logger.error({
          message: `Was unable to log in user ${body.username} for account ${accountId}`,
          accountId,
          service: AccountConfigService.name,
          function: 'setServiceWorker',
        });

        return null;
      }

      const expiry = Date.now() + sessionTTl;

      const config = await encrypt(
        JSON.stringify(
          Object.assign({}, body, {
            bearer,
            expiry,
          }),
        ),
      );

      await this.serviceWorkerCollection.doc(accountId).set({
        config,
        accountId,
      });

      await this.cacheService.setServiceWorker(accountId, bearer);
      await this.accountConfigService.getAllUsers(accountId, bearer);

      this.logger.info({
        fn: function_,
        message: `Service worker set for account ${accountId}, token validated`,
        accountId,
      });

      return bearer;
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error setting service worker for Account ' + body.accountId,
        error,
      });

      return null;
    }
  }

  async setWorkerByUser(user: UserDto, accountId: string, token: string) {
    const function_ = 'setWorkerByUser';
    const { allowedAppKeys } = user;

    if (!allowedAppKeys) {
      this.logger.error({
        fn: function_,
        message: `No allowed app keys found for user ${user.id}`,
        userId: user?.id,
      });

      throw new InternalServerErrorException(
        'No allowed app keys found for user',
      );
    }

    if (!accountId) {
      this.logger.error({
        fn: function_,
        message: `No accountId provided for user ${user.id}`,
        userId: user?.id,
      });

      throw new InternalServerErrorException('No accountId provided');
    }

    if (!token) {
      throw new UnauthorizedException(
        'No token provided. Please log in to set the service worker.',
      );
    }

    const apiKey = await this.accountConfigService.getAppKey(
      accountId,
      allowedAppKeys,
      token,
    );

    if (!apiKey) {
      this.logger.error({
        fn: function_,
        message: `API key not found [${allowedAppKeys}] for account ${accountId}`,
        accountId,
        userId: user?.id,
      });

      throw new InternalServerErrorException(
        'No API key found for account and user',
      );
    }

    const serviceWorker: ServiceWorkerConfigDto = {
      id: String(user.id),
      username: user.loginName,
      appKey: allowedAppKeys,
      secret: apiKey.appSecret,
      accessToken: apiKey.token,
      accessTokenSecret: apiKey.tokenSecret,
      accountId,
    };

    const outcome = await this.setServiceWorker(serviceWorker);

    if (!outcome) {
      this.logger.error({
        fn: function_,
        message: `Failed to set service worker for account ${accountId} and user ${user.id}`,
        accountId,
        userId: user?.id,
      });

      throw new InternalServerErrorException(
        'Failed to set service worker for account and user',
      );
    }
  }

  async getAndSetServiceWorker(accountId: string): Promise<string | null> {
    const worker = await this.getServiceWorker(accountId);

    if (!worker) {
      this.logger.warn(
        ctx(context, 'getAndSetServiceWorker', {
          accountId,
          message: 'No service worker found for this account',
        }),
      );

      return null;
    }

    worker.accountId = accountId; // Ensure accountId is set
    // if worker.bearer AND worker.expiry is more than 2 hours > now
    const now = Date.now();

    if (worker.bearer && worker.expiry > now + 2 * 60 * 60 * 1000) {
      const valid = await this.testToken(accountId, worker.bearer);

      if (valid) {
        this.logger.info({
          fn: 'getAndSetServiceWorker',
          message: `Service worker token is valid for account ${accountId}`,
          accountId,
        });

        return worker.bearer;
      }
    }

    const token = await this.setServiceWorker(worker);

    if (!token) {
      this.logger.error(
        ctx(context, 'getAndSetServiceWorker', {
          accountId,
          message: 'Failed to set service worker token',
        }),
      );

      return null;
    }

    return token;
  }

  async testToken(accountId: string, token: string) {
    try {
      const LECCUI = await this.accountConfigService.getAllUsers(
        accountId,
        token,
      );

      if (!LECCUI) {
        this.logger.error({
          fn: 'testToken',
          message: `worker failed for LE CORE APIs`,
          accountId,
        });

        return false;
      }

      const AI_STUDIO = await this.aiStudioService.listFlows(accountId, token);

      if (!AI_STUDIO) {
        this.logger.error({
          fn: 'testToken',
          message: `worker failed for AI Studio APIs`,
          accountId,
        });

        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(error);

      return false;
    }
  }

  async getTokenWithFallback(accountId: string): Promise<string | null> {
    const function_ = 'getTokenWithFallback';

    try {
      const { token } =
        (await this.cacheService.getServiceWorker(accountId)) || {};

      if (token) {
        return token;
      }

      const worker = await this.getAndSetServiceWorker(accountId);

      if (!worker) {
        this.logger.error({
          fn: function_,
          message: `No service worker found for account ${accountId}`,
          accountId,
        });

        return null;
      }

      return worker;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting service worker token',
        accountId,
      });

      throw new InternalServerErrorException(
        ...ctx(context, function_, error),
        accountId,
      );
    }
  }

  async testServiceWorker(accountId: string): Promise<{
    id: string;
    message?: string;
    status: string;
    username: string;
  }> {
    const function_ = 'testServiceWorker';

    try {
      const worker = await this.getServiceWorker(accountId);

      if (!worker) {
        const response = {
          status: 'error',
          message: 'No service worker found for this account',
          id: '',
          username: '',
        };

        this.logger.warn(response);

        return response;
      }

      const _token = await this.getTokenWithFallback(accountId);
      const valid = await this.testToken(accountId, _token);

      if (!valid) {
        this.logger.error({
          fn: function_,
          message: `Service worker token is invalid for account ${accountId}. Logging in Bot User and setting worker token.`,
          accountId,
        });

        const token = await this.setServiceWorker(worker);

        if (!token) {
          const response = {
            status: 'error',
            id: worker?.id,
            username: worker?.username,
            message: `Failed to set service worker token for account ${accountId}`,
          };

          this.logger.error(response);

          return response;
        }
      }

      const response = {
        status: 'success',
        message: `Service worker is active for account ${accountId}`,
        id: worker.id,
        username: worker.username,
      };

      this.logger.info(response);

      return response;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: `Error testing service worker for account ${accountId}`,
        accountId,
      });

      const response = {
        status: 'error',
        id: '',
        username: '',
        message: `Error testing service worker for account ${accountId}: ${error.message}`,
      };

      return response;
    }
  }
}
