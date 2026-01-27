import {
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CollectionReference, FieldValue } from '@google-cloud/firestore';
import { randomInt } from 'crypto';

import {
  CONVERSATION_SIMULATION_STATES,
  CONVERSATION_STATE,
  ONGOING_SIMULATION_STATUSES,
} from 'src/constants/constants';
import { helper } from 'src/utils/HelperService';

import { CacheService } from '../Cache/cache.service';
import { SimulationPromptDto } from '../Configuration/configuration.dto';
import { AppConfigurationService } from '../Configuration/configuration.service';
import {
  SimulationConversation,
  TaskRequestDto,
  TaskStatus,
} from '../Simulation/simulation.dto';

import {
  ApplicationSettingsDto,
  GlobalApplicationSettingsDto,
  PersistentIdentityDto,
  PersonaDto,
  ScenarioDto,
  SimulationCategory,
} from './database.dto';

const context_ = helper.ctx;

export const context = '[DB_SERVICE]';

@Injectable()
export class DatabaseService implements OnModuleInit {
  restrictAccount: boolean;
  dev_account: string[];
  constructor(
    @InjectPinoLogger(DatabaseService.name)
    private readonly logger: PinoLogger,
    @Inject(SimulationConversation.collectionName)
    private conversationCollection: CollectionReference<SimulationConversation>,
    @Inject(SimulationPromptDto.collectionName)
    private promptCollection: CollectionReference<SimulationPromptDto>,
    @Inject(ScenarioDto.collectionName)
    private scenarioCollection: CollectionReference<ScenarioDto>,
    @Inject(PersonaDto.collectionName)
    private personaCollection: CollectionReference<PersonaDto>,
    @Inject(SimulationCategory.collectionName)
    private categoryCollection: CollectionReference<SimulationCategory>,
    @Inject(TaskStatus.collectionName)
    private taskCollection: CollectionReference<TaskStatus>,
    @Inject(PersistentIdentityDto.collectionName)
    private identityCollection: CollectionReference<PersistentIdentityDto>,
    @Inject(GlobalApplicationSettingsDto.collectionName)
    private globalAppSettingsCollection: CollectionReference<GlobalApplicationSettingsDto>,
    @Inject(ApplicationSettingsDto.collectionName)
    private applicationSettingsCollection: CollectionReference<ApplicationSettingsDto>,
    private configService: ConfigService,
    private readonly cache: CacheService,
    private appConfigService: AppConfigurationService,
  ) {
    this.logger.setContext(context);

    this.restrictAccount = helper.toBoolean(
      this.configService.get<boolean>('RESTRICT_ACCOUNT') || false,
    );

    const da =
      this.configService.get<string>('DEVELOPER_ACCOUNT_ID') || '31487986';

    this.dev_account = da.includes(',') ? da.split(',') : [da];
  }
  async onModuleInit() {
    await this.hydrateCache();
  }

  /***
   * PERSONAS
   */
  async getPersonas(accountId: string): Promise<PersonaDto[]> | null {
    const function_ = 'getPersonas';

    try {
      const personas: PersonaDto[] = [];
      const snapshot = await this.personaCollection.get();

      snapshot.forEach((document_) => {
        const persona = document_.data();

        if (persona.accountId === accountId) {
          personas.push(persona);
        }
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
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getEnabledPersona(accountId: string) {
    const _p1 = await this.getPersonas(accountId);
    const _p2 = _p1.filter((persona) => persona.enabled);
    const personas = _p2.map((persona) => persona.id);

    return personas;
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
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getRandomPersona(_cache: { personas: string[] }, accountId: string) {
    const personaIds = _cache.personas;

    if (!personaIds || personaIds.length === 0) {
      throw new InternalServerErrorException(
        ...context_(context, 'getRandomPersona', 'No personas available'),
      );
    }

    const personaId = personaIds[randomInt(0, personaIds.length)];
    const databasePersonaItem = await this.getPersona(accountId, personaId);

    if (!databasePersonaItem) {
      throw new InternalServerErrorException(
        ...context_(context, 'getRandomPersona', `Persona not found`),
      );
    }

    const traits = Array.isArray(databasePersonaItem.traits)
      ? databasePersonaItem.traits.join(', ')
      : databasePersonaItem.traits || '';

    const commonComments = Array.isArray(databasePersonaItem.commonComments)
      ? databasePersonaItem.commonComments.join(', ')
      : databasePersonaItem.commonComments || '';

    const personaText = `Name: ${databasePersonaItem.name}\nDescription: ${databasePersonaItem.description}\nTraits: ${traits}\nCommon Comments: ${commonComments}`;

    return {
      personaId,
      persona: databasePersonaItem,
      personaText,
    };
  }

  async getPersonaById(
    accountId: string,
    id: string,
  ): Promise<{
    persona: string;
    personaId: string;
    personaName: string;
  }> {
    const _cachedPersona = await this.cache.getPersona(accountId, id);

    if (_cachedPersona) {
      return _cachedPersona;
    }

    const databasePersonaItem = await this.personaCollection.doc(id).get();

    if (!databasePersonaItem.exists) {
      return null;
    }

    const persona = databasePersonaItem.data();

    const traits = Array.isArray(persona.traits)
      ? persona.traits.join(', ')
      : persona.traits || '';

    const commonComments = Array.isArray(persona.commonComments)
      ? persona.commonComments.join(', ')
      : persona.commonComments || '';

    const personaText = `Name: ${persona.name}\nDescription: ${persona.description}\nTraits: ${traits}\nCommon Comments: ${commonComments}`;

    return {
      persona: personaText,
      personaName: persona.name,
      personaId: persona.id,
    };
  }

  /***
   * SCENARIOS
   */
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

  async getEnabledScenarios(accountId: string, enabledCategories: string[]) {
    const _s1 = await this.getAccountScenarios(accountId);

    const _s2 = _s1.filter(
      (scenario) =>
        scenario.topicEnabled &&
        enabledCategories.includes(scenario.categoryId),
    );

    const scenarios = _s2.map((scenario) => scenario.id);

    return scenarios;
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

  async getRandomScenario(_cache: { scenarios: string[] }): Promise<{
    scenario: ScenarioDto;
    scenarioId: string;
    scenarioName: string;
    scenarioText: string;
  } | null> {
    this.logger.debug(`getRandomScenario: ${JSON.stringify(_cache)}`);
    this.logger.info(`scenarios: ${JSON.stringify(_cache.scenarios)}`);
    const scenarioIds = _cache.scenarios;

    if (!scenarioIds || scenarioIds.length === 0) {
      return null;
    }

    // Use crypto.randomInt for a cryptographically secure random index
    const scenarioId = scenarioIds[randomInt(0, scenarioIds.length)];

    const databaseScenarioItem = await this.getScenario(scenarioId);

    if (!databaseScenarioItem) {
      throw new InternalServerErrorException(
        ...context_(context, 'getRandomScenario', `Scenario not found`),
      );
    }

    const criteriaList =
      databaseScenarioItem?.successCriteria
        ?.map(
          (criteria) =>
            '- ' +
            criteria.value +
            '[' +
            (criteria.required ? 'mandatory' : '') +
            ']',
        )
        .join('\n') || '';

    const scenarioText = `Scenario: ${databaseScenarioItem.topic}\nDetails: ${databaseScenarioItem.scenario}\nSuccess Criteria: ${criteriaList || 'N/A'}`;

    return {
      scenarioId,
      scenarioName: databaseScenarioItem.topic || '',
      scenario: databaseScenarioItem,
      scenarioText,
    };
  }

  async getScenarioById(accountId: string, id: string): Promise<string | null> {
    const _cachedScenario = await this.cache.getScenario(accountId, id);

    if (_cachedScenario) {
      return _cachedScenario;
    }

    const databaseScenarioItem = await this.scenarioCollection.doc(id).get();

    if (!databaseScenarioItem.exists) {
      return null;
    }

    const scenario = databaseScenarioItem.data();

    const criteriaList =
      scenario?.successCriteria
        ?.map(
          (criteria) =>
            '- ' +
            criteria.value +
            '[' +
            (criteria.required ? 'mandatory' : '') +
            ']',
        )
        .join('\n') || '';

    const scenarioText = `Scenario: ${scenario.topic}\nDetails: ${scenario.scenario}\nSuccess Criteria: ${criteriaList || 'N/A'}`;

    return scenarioText;
  }

  async getEnabledCategories(accountId: string) {
    const _c1 = await this.getCategories(accountId);
    const _c2 = _c1.filter((category) => category.enabled);
    const enabledCategories = _c2.map((category) => category.id);

    return enabledCategories;
  }

  async getRunningTasks(accountId: string): Promise<TaskStatus[]> {
    const allCachedTasks =
      await this.cache.getAllActiveTasksForAccount(accountId);

    if (allCachedTasks && allCachedTasks.length > 0) {
      return allCachedTasks;
    }

    const allTasks = await this.taskCollection
      .where('accountId', '==', accountId)
      .where('status', 'in', ONGOING_SIMULATION_STATUSES)
      .get();

    if (allTasks.empty) {
      return [];
    }

    const tasks = allTasks.docs.map((document_) => {
      const task = document_.data();

      if (!task) {
        return null;
      }

      if (task.accountId !== accountId) {
        return null;
      }

      return task;
    });

    return tasks.filter((t) => t !== null);
  }

  async getPrompt(
    accountId: string,
    promptId: string,
    useCache = true,
  ): Promise<string | null> {
    const function_ = 'getPrompt';

    try {
      if (useCache) {
        const cachedPrompt = await this.cache.getPrompt(accountId, promptId);

        if (cachedPrompt) {
          return cachedPrompt;
        }
      }

      const promptItem = await this.promptCollection.doc(promptId).get();

      if (!promptItem.exists) {
        this.logger.error({
          fn: function_,
          message: 'Prompt not found',
          accountId,
        });

        return null;
      }

      const prompt = promptItem.data();

      if (prompt.template) {
        await this.cache.setPrompt(accountId, promptId, prompt.prompt);

        return prompt.prompt;
      }

      if (prompt.accountId !== accountId) {
        this.logger.error({
          fn: function_,
          message: 'Prompt not found for account',
          accountId,
        });

        return null;
      }

      await this.cache.setPrompt(accountId, promptId, prompt.prompt);

      return prompt.prompt;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting prompt',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getPromptById(
    accountId: string,
    promptId: string,
  ): Promise<string | undefined> {
    if (!promptId) {
      throw new Error('Prompt ID is required to get a prompt from cache');
    }

    const promptItem = await this.promptCollection.doc(promptId).get();

    if (!promptItem.exists) {
      return undefined;
    }

    const promptDocument = promptItem.data();

    this.logger.debug({
      message: 'Retrieved prompt from database',
      accountId,
      promptId,
      promptDocument: JSON.stringify(promptDocument),
    });

    if (promptDocument.accountId !== accountId && !promptDocument.template) {
      return undefined;
    }

    return promptDocument.prompt;
  }

  async canCreateNewTask(
    accountId: string,
    userId: string,
  ): Promise<TaskStatus> {
    const function_ = 'canCreateNewTask';

    try {
      /**
       * A new task can be created if the user does not have any running
       * tasks & the account has not reached its maximum task limit
       */
      const maxTasks = this.configService.get<number>('MAX_ACCOUNT_TASKS') || 2;
      const runningTasks = await this.getRunningTasks(accountId);

      if (runningTasks.length > maxTasks) {
        throw new InternalServerErrorException(
          `Maximum number of tasks already running for account ${accountId}, please wait until they are completed or cancelled`,
        );
      }

      const userTasks = runningTasks.filter(
        (task) => String(task.createdBy) === userId,
      );

      if (userTasks.length > 0) {
        this.logger.error({
          fn: function_,
          message: `Task already running for account ${accountId} and user ${userId}`,
          accountId,
          existingTask: userTasks[0].requestId,
          userId,
          userTasks: userTasks[0],
        });

        return userTasks[0];
      }

      return null;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: error,
        accountId,
        userId,
      });

      throw new InternalServerErrorException(error);
    }
  }

  async getAllRunningTasks() {
    const function_ = 'getAllRunningTasks';

    try {
      if (this.restrictAccount) {
        console.info('RESTRICT MODE, account: ' + this.dev_account);
      }

      const allTasks = this.restrictAccount
        ? await this.taskCollection
            .where('status', 'in', ONGOING_SIMULATION_STATUSES)
            .where('accountId', 'in', this.dev_account)
            .get()
        : await this.taskCollection
            .where('status', 'in', ONGOING_SIMULATION_STATUSES)
            .get();

      if (allTasks.empty) {
        return [];
      }

      const tasks = allTasks.docs.map((document_) => document_.data());

      return tasks;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error getting all running tasks: ${error}`,
      });

      throw new InternalServerErrorException(error);
    }
  }

  async getRunningTasksByUser(
    accountId: string,
    userId: string,
  ): Promise<TaskStatus[]> {
    const function_ = 'getRunningTasksByUser';

    try {
      const allTasks = await this.taskCollection
        .where('accountId', '==', accountId)
        .where('status', 'in', ONGOING_SIMULATION_STATUSES)
        .get();

      if (allTasks.empty) {
        return [];
      }

      const tasks = allTasks.docs.map((document_) => {
        const task = document_.data();

        if (!task) {
          return null;
        }

        if (task.accountId !== accountId) {
          return null;
        }

        if (String(task.createdBy) !== userId) {
          return null;
        }

        return Object.assign({}, task);
      });

      return tasks.filter((task) => task !== null);
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error getting running tasks for account ${accountId} and user ${userId}: ${error}`,
        accountId,
        userId,
      });

      throw new InternalServerErrorException(error);
    }
  }

  async addTask(accountId: string, task: TaskStatus): Promise<TaskStatus> {
    const function_ = 'addTask';

    // try {
    if (!accountId) {
      this.logger.error({
        fn: function_,
        message: 'AccountId is required',
      });

      throw new InternalServerErrorException('AccountId is required');
    }

    if (!task?.requestId) {
      this.logger.error({
        fn: function_,
        message: 'Task is empty or missing requestId',
        accountId,
      });

      throw new InternalServerErrorException(
        'Task is empty or missing requestId',
      );
    }

    await this.cache.addTask(accountId, task.requestId, task);
    // Convert to plain object to avoid Firestore serialization issues
    const plainTask = JSON.parse(JSON.stringify(task));

    await this.taskCollection.doc(task.requestId).set(plainTask);

    return task;
  }

  async updateTask(
    accountId: string,
    taskId: string,
    data: any,
    remove?: string[],
  ) {
    if (!accountId || !taskId) {
      this.logger.error({
        fn: 'updateTask',
        message: 'AccountId and TaskId are required',
      });

      throw new InternalServerErrorException(
        'AccountId and TaskId are required',
      );
    }

    // Always fetch the current task, either from cache or Firestore
    let task = await this.cache.getTask(accountId, taskId);

    if (!task) {
      // Cache miss - fetch from Firestore to avoid data loss
      task = await this.getTask(accountId, taskId, false);

      if (!task) {
        throw new InternalServerErrorException(
          `Task with ID ${taskId} not found for account ${accountId}`,
        );
      }
    }

    const toSet = Object.assign({}, task, data);

    for (const key of remove || []) {
      if (Object.prototype.hasOwnProperty.call(toSet, key)) {
        Reflect.deleteProperty(toSet, key);
      }
    }

    await this.cache.addTask(accountId, taskId, toSet);

    /* Use update instead of set to avoid overwriting the entire document */
    const updateData = { ...data };

    // Add field deletions to the update data if needed
    if (remove && remove.length > 0) {
      for (const key of remove) {
        if (typeof key === 'string' && key.length > 0) {
          Object.defineProperty(updateData, key, {
            value: FieldValue.delete(),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      }
    }

    const plainUpdateData = JSON.parse(JSON.stringify(updateData));

    await this.taskCollection.doc(taskId).update(plainUpdateData);
  }

  async getTask(
    accountId: string,
    requestId: string,
    useCache?: boolean,
  ): Promise<TaskStatus | null> {
    const function_ = 'getTask';

    try {
      if (useCache) {
        const cachedTask = await this.cache.getTask(accountId, requestId);

        if (cachedTask) {
          return cachedTask;
        }
      }

      const taskItem = await this.taskCollection.doc(requestId).get();

      this.logger.debug({
        fn: function_,
        message: `Fetching task ${requestId}, exists?: ${taskItem.exists}`,
      });

      if (!taskItem.exists) {
        this.logger.error({
          fn: function_,
          message: 'Task not found',
          accountId,
        });

        return null;
      }

      const task = taskItem.data();

      if (task.accountId !== accountId) {
        this.logger.error({
          fn: function_,
          message: 'Task not found for account',
          accountId,
        });

        return null;
      }

      return Object.assign({}, task);
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting task',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async updateConversation(
    accountId: string,
    conversationId: string,
    data: any,
    remove?: string[],
  ) {
    const conversation =
      (await this.cache.getConversation(accountId, conversationId)) ||
      ({} as SimulationConversation);

    const toSet: any = Object.assign({}, conversation || {}, data);

    if (remove && remove.length > 0) {
      for (const key of remove) {
        if (Object.prototype.hasOwnProperty.call(toSet, key)) {
          Reflect.deleteProperty(toSet, key);
        }
      }
    }

    if (conversation.status === CONVERSATION_STATE.CLOSE)
      toSet.status = CONVERSATION_STATE.CLOSE;

    if (conversation.state === CONVERSATION_SIMULATION_STATES.COMPLETED)
      toSet.state = CONVERSATION_SIMULATION_STATES.COMPLETED;

    if (!conversation.active) toSet.active = false;

    this.cache.addConversation(accountId, toSet);
    const plainConversation = JSON.parse(JSON.stringify(toSet));

    this.conversationCollection.doc(conversationId).set(plainConversation);
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
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getApplicationSetting(
    accountId: string,
    settingName: string,
  ): Promise<any> {
    const applicationSettings = await this.cache.getAccountSettings(accountId);

    if (applicationSettings?.settings) {
      const setting = applicationSettings.settings.find(
        (s: { name: string }) => s.name === settingName,
      );

      if (setting) {
        return setting.value;
      }
    }

    const settings = await this.getApplicationSettings(accountId);

    if (!settings?.settings) {
      this.logger.error({
        fn: 'getApplicationSetting',
        message: `No application settings found for account ${accountId}`,
        accountId,
      });

      throw new InternalServerErrorException(
        `No application settings found for account ${accountId}`,
      );
    }

    const setting = settings.settings.find(
      (s: { name: string }) => s.name === settingName,
    );

    if (!setting) {
      this.logger.error({
        fn: 'getApplicationSetting',
        message: `No setting found for account ${accountId} and settingName ${settingName}`,
        accountId,
        settingName,
      });

      throw new InternalServerErrorException(
        `No setting found for account ${accountId} and settingName ${settingName}`,
      );
    }

    await this.cache.setAccountSettings(accountId, settings);

    return setting.value;
  }

  async getToken(accountId: string): Promise<string> {
    const token = await this.appConfigService.getTokenWithFallback(accountId);

    if (!token) {
      this.logger.error({
        fn: 'getToken',
        level: 'error',
        message: 'No token found',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          'getToken',
          `No token found for account ${accountId}`,
        ),
      );
    }

    return token;
  }

  async getSyntheticCustomerComponents(
    accountId: string,
    task: TaskRequestDto,
  ) {
    const function_ = 'getSyntheticCustomerComponents';
    const { useTemplate, personas, influences, scenarios } = task;

    if (useTemplate) {
      return {
        personas,
        influences,
        scenarios,
      };
    }

    const enabledCategories = await this.getEnabledCategories(accountId);

    if (!enabledCategories || enabledCategories.length === 0) {
      throw new InternalServerErrorException(
        `No enabled categories found for account ${accountId}`,
      );
    }

    const _scenarios = await this.getEnabledScenarios(
      accountId,
      enabledCategories,
    );

    if (!_scenarios || _scenarios.length === 0) {
      throw new InternalServerErrorException(
        context_(context, function_, 'No enabled scenarios found'),
        accountId,
      );
    }

    const _personas = await this.getEnabledPersona(accountId);

    if (!_personas || _personas.length === 0) {
      throw new InternalServerErrorException(
        context_(context, function_, 'No enabled personas found'),
        accountId,
      );
    }

    return {
      personas: _personas,
      scenarios: _scenarios,
    };
  }

  async addConversation(
    accountId: string,
    conversation: SimulationConversation,
  ): Promise<SimulationConversation> {
    const function_ = 'addConversation';

    if (!accountId) {
      this.logger.error({
        fn: function_,
        message: 'AccountId is required',
      });

      throw new InternalServerErrorException('AccountId is required');
    }

    if (!conversation?.id) {
      this.logger.error({
        fn: function_,
        message: 'Conversation is empty or missing conversationId',
        accountId,
      });

      throw new InternalServerErrorException(
        'Conversation is empty or missing conversationId',
      );
    }

    await this.cache.addConversation(accountId, conversation);
    const plainConversation = JSON.parse(JSON.stringify(conversation));

    await this.conversationCollection
      .doc(conversation.id)
      .set(plainConversation);

    return conversation;
  }

  async getAllConversationsForAccount(
    accountId: string,
  ): Promise<SimulationConversation[]> {
    const function_ = 'getAllConversationsForAccount';

    try {
      const conversations: SimulationConversation[] = [];

      const snapshot = await this.conversationCollection
        .where('accountId', '==', accountId)
        .get();

      snapshot.forEach((document_) => {
        const conversation = document_.data();

        if (conversation.accountId === accountId) {
          conversations.push(conversation);
        }
      });

      return conversations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting conversations',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getConversation(
    accountId: string,
    conversationId: string,
    useCache?: boolean,
  ): Promise<SimulationConversation | null> {
    const function_ = 'getConversation';

    try {
      if (useCache) {
        const cachedConversation = await this.cache.getConversation(
          accountId,
          conversationId,
        );

        if (cachedConversation) {
          return cachedConversation;
        }
      }

      const conversationItem = await this.conversationCollection
        .doc(conversationId)
        .get();

      if (!conversationItem.exists) {
        this.logger.error({
          fn: function_,
          message: 'Conversation not found',
          accountId,
          conversationId,
        });

        return null;
      }

      const conversation = conversationItem.data();

      if (conversation.accountId !== accountId) {
        this.logger.error({
          fn: function_,
          message: 'Conversation not found for account',
          accountId,
          conversationId,
        });

        return null;
      }

      return conversation;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting conversation',
        accountId,
        conversationId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getConversationsByIds(
    accountId: string,
    conversationIds: string[],
  ): Promise<SimulationConversation[]> {
    const function_ = 'getConversationsByIds';

    try {
      if (!conversationIds || conversationIds.length === 0) {
        this.logger.error({
          fn: function_,
          message: 'No conversationIds provided',
          accountId,
        });

        return [];
      }

      const conversations: SimulationConversation[] = [];

      const snapshot = await this.conversationCollection
        .where('accountId', '==', accountId)
        .where('id', 'in', conversationIds)
        .get();

      snapshot.forEach((document_) => {
        const conversation = document_.data();

        if (conversation.accountId === accountId) {
          conversations.push(conversation);
        }
      });

      return conversations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting conversations by ids',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getConversationsByFirstAgentAssigned(
    accountId: string,
    agentId: number,
  ) {
    const function_ = 'getConversationsByFirstAgentAssigned';

    try {
      const conversations: SimulationConversation[] = [];

      const snapshot = await this.conversationCollection
        .where('accountId', '==', accountId)
        .where('firstAssignedAgent', '==', agentId)
        .get();

      snapshot.forEach((document_) => {
        const conversation = document_.data();

        if (conversation.accountId === accountId) {
          conversations.push(conversation);
        }
      });

      return conversations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting conversations by first assigned agent',
        accountId,
        agentId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getConversationsByLastAgentAssigned(
    accountId: string,
    agentId: number,
  ) {
    const function_ = 'getConversationsByLastAgentAssigned';

    try {
      const conversations: SimulationConversation[] = [];

      const snapshot = await this.conversationCollection
        .where('accountId', '==', accountId)
        .where('lastAssignedAgent', '==', agentId)
        .get();

      snapshot.forEach((document_) => {
        const conversation = document_.data();

        if (conversation.accountId === accountId) {
          conversations.push(conversation);
        }
      });

      return conversations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting conversations by last assigned agent',
        accountId,
        agentId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getConversationsByTaskId(
    accountId: string,
    taskId: string,
    useCache?: boolean,
  ) {
    const function_ = 'getConversationsByTaskId';

    try {
      if (!taskId) {
        this.logger.error({
          fn: function_,
          message: 'No taskId provided',
          accountId,
        });

        return [];
      }

      if (useCache) {
        const cachedConversations =
          await this.cache.getConversationsByRequestId(accountId, taskId);

        if (cachedConversations && cachedConversations.length > 0) {
          return cachedConversations;
        }
      }

      const conversations: SimulationConversation[] = [];

      const snapshot = await this.conversationCollection
        .where('accountId', '==', accountId)
        .where('requestId', '==', taskId)
        .get();

      snapshot.forEach((document_) => {
        const conversation = document_.data();

        if (conversation.accountId === accountId) {
          conversations.push(conversation);
        }
      });

      return conversations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting conversations by task id',
        accountId,
        taskId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getActiveConversationsByCustomerId(
    accountId: string,
    customerId: string,
  ): Promise<SimulationConversation[]> {
    const function_ = 'getActiveConversationsByCID';

    try {
      if (!accountId || !customerId) {
        return [];
      }

      const conversationsQuery = await this.conversationCollection
        .where('accountId', '==', accountId)
        .where('customerId', '==', customerId)
        .where('status', '==', 'OPEN') // Only active conversations
        .get();

      if (conversationsQuery.empty) {
        return [];
      }

      return conversationsQuery.docs.map((document_) =>
        Object.assign({ id: document_.id }, document_.data()),
      ) as SimulationConversation[];
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting active conversations by customerId',
        accountId,
        customerId,
      });

      // Return empty array instead of throwing to avoid blocking conversation creation
      return [];
    }
  }

  async deleteTask(accountId: string, taskId: string): Promise<void> {
    const function_ = 'deleteTask';

    try {
      await this.taskCollection.doc(taskId).delete();

      this.logger.info({
        fn: function_,
        message: 'Task deleted successfully',
        accountId,
        taskId,
      });
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error deleting task',
        accountId,
        taskId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async getTasks(
    accountId: string,
    toInclude: string[],
    timeframe: { from: number; to: number },
  ) {
    const function_ = 'getTasks';

    try {
      const tasks: TaskStatus[] = [];

      const snapshot = await this.taskCollection
        .where('accountId', '==', accountId)
        .where('createdAt', '>=', timeframe.from)
        .where('createdAt', '<=', timeframe.to)
        .get();

      snapshot.forEach((document_) => {
        const task = document_.data();

        if (task.accountId === accountId) {
          tasks.push(task);
        }
      });

      return tasks.map((task) => {
        const filtered: Partial<TaskStatus> = {};

        toInclude.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(task, field)) {
            const value = Object.getOwnPropertyDescriptor(task, field)?.value;

            if (value !== undefined) {
              Object.defineProperty(filtered, field, {
                value,
                enumerable: true,
                writable: true,
                configurable: true,
              });
            }
          }
        });

        return filtered;
      });
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting tasks',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
        accountId,
      );
    }
  }

  async clearInvalidTasks() {
    const function_ = 'clearInvalidTasks';

    try {
      // document must have
      // createdAt, createdBy, scenarios, prompts, personas, status, useDelays, maxConversations, maxTurnsconcurrentConversations, completedConversations, brandName, accountId,
      const allTasks = await this.taskCollection.get();
      // iterate over all tasks and delete tasks that do not have required properties
      const tasksToDelete: { accountId: string; id: string }[] = [];

      allTasks.forEach((task) => {
        const taskData = task.data();

        if (
          !taskData.createdAt ||
          !taskData.createdBy ||
          !taskData.scenarios ||
          !taskData.prompts ||
          !taskData.personas ||
          !taskData.status ||
          !taskData.useDelays ||
          !taskData.maxConversations ||
          !taskData.maxTurns ||
          !taskData.concurrentConversations ||
          !taskData.brandName ||
          !taskData.accountId
        ) {
          const requiredProperties = [
            'createdAt',
            'createdBy',
            'scenarios',
            'prompts',
            'personas',
            'status',
            'useDelays',
            'maxConversations',
            'maxTurns',
            'concurrentConversations',
            'brandName',
            'accountId',
          ];

          const missingProperties = requiredProperties.filter((property) => {
            if (!Object.prototype.hasOwnProperty.call(taskData, property)) {
              return true;
            }

            const descriptor = Object.getOwnPropertyDescriptor(
              taskData,
              property,
            );

            return !descriptor?.value;
          });

          if (missingProperties.length > 0) {
            this.logger.warn({
              fn: function_,
              message: `Task ${task.id} is missing required properties: ${missingProperties.join(', ')}`,
              accountId: taskData.accountId,
              taskId: task.id,
            });
          }

          tasksToDelete.push({ id: task.id, accountId: taskData.accountId });
        }
      });

      await Promise.all(
        tasksToDelete.map(({ id, accountId }) =>
          this.deleteTask(accountId, id),
        ),
      );
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error clearing invalid tasks',
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
      );
    }
  }

  async hydrateCache() {
    const accountIds = [];
    const runningTasks = await this.getAllRunningTasks();

    if (!runningTasks || runningTasks.length === 0) {
      this.logger.info({
        message: 'No running tasks found during module initialization',
      });

      return;
    }

    for (const task of runningTasks) {
      try {
        await this.cache.addTask(task.accountId, task.requestId, task);

        if (!accountIds.includes(task.accountId)) {
          accountIds.push(task.accountId);
        }

        const maxConversationLimit =
          this.configService.get<number>('MAX_CONVERSATIONS_LIMIT') || 20;

        await this.cache.setMaxConversationLimit(
          task.requestId,
          Math.min(
            task.maxConversations || maxConversationLimit,
            maxConversationLimit,
          ),
        );

        this.logger.info({
          message: `Task ${task.requestId} added to cache during module initialization`,
          accountId: task.accountId,
        });

        const conversations = await this.getConversationsByTaskId(
          task.accountId,
          task.requestId,
          true,
        );

        if (conversations && conversations.length > 0) {
          for (const conversation of conversations) {
            await this.cache.addConversation(task.accountId, conversation);

            this.logger.info({
              message: `Conversation ${conversation.id} added to cache during module initialization`,
              accountId: task.accountId,
            });
          }
        }

        this.logger.info({
          message: `Task ${task.requestId} with accountId ${task.accountId} added to cache during module initialization`,
          conversations: `${conversations.length} conversations found`,
        });
      } catch (error) {
        this.logger.error({
          message: `Error adding task ${task.requestId} to cache during module initialization`,
          error,
          accountId: task.accountId,
        });
      }
    }

    for (const accountId of accountIds) {
      try {
        const applicationSettings =
          await this.getApplicationSettings(accountId);

        await this.cache.setAccountSettings(accountId, applicationSettings);

        this.logger.info({
          message: `Application settings for account ${accountId} added to cache during module initialization`,
        });
      } catch (error) {
        this.logger.error({
          message: `Error adding application settings for account ${accountId} to cache during module initialization`,
          error,
        });
      }
    }
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple test: try to read from a collection
      await this.taskCollection.limit(1).get();

      return true;
    } catch (error) {
      this.logger.error({
        message: 'Database health check failed',
        error: error.message,
        service: DatabaseService.name,
        function: 'healthCheck',
      });

      return false;
    }
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'ABORTED',
      'UNAVAILABLE',
      'DEADLINE_EXCEEDED',
      'INTERNAL',
      'RESOURCE_EXHAUSTED',
    ];

    return error.code && retryableCodes.includes(error.code);
  }

  async getIdentities(
    accountId: string,
  ): Promise<PersistentIdentityDto[]> | null {
    const function_ = 'getIdentities';

    try {
      const identities: PersistentIdentityDto[] = [];

      const snapshot = await this.identityCollection
        .where('accountId', '==', accountId)
        .get();

      snapshot.forEach((document_) => {
        const identity = document_.data();

        if (identity.accountId === accountId) {
          identities.push(identity);
        }
      });

      return identities;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting identities',
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, 'Error getting identities', error),
      );
    }
  }

  async getIdentity(
    accountId: string,
    id: string,
  ): Promise<PersistentIdentityDto> | null {
    const function_ = 'getIdentity';

    try {
      const databaseIdentityItem = await this.identityCollection.doc(id).get();

      if (!databaseIdentityItem.exists) {
        return null;
      }

      const databaseIdentity = databaseIdentityItem.data();

      if (!databaseIdentity) {
        return null;
      }

      return databaseIdentity;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting identity',
        accountId,
        id,
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, 'Error getting identity', error),
      );
    }
  }

  async getEnabledCategoriesByIds(
    accountId: string,
    categories: string[],
  ): Promise<string[]> {
    const c = await this.categoryCollection
      .where('accountId', '==', accountId)
      .where('enabled', '==', true)
      .where('id', 'in', categories)
      .get();

    if (c.empty) {
      return [];
    }

    return c.docs.map((document_) => document_.data().id);
  }

  async getEnabledScenariosByIds(
    accountId: string,
    scenarios: string[],
  ): Promise<ScenarioDto[]> {
    const s = await this.scenarioCollection
      .where('accountId', '==', accountId)
      .where('topicEnabled', '==', true)
      .where('id', 'in', scenarios)
      .get();

    if (s.empty) {
      return [];
    }

    return s.docs.map((document_) => document_.data());
  }

  async getEnabledPersonasByIds(
    accountId: string,
    personas: string[],
  ): Promise<PersonaDto[]> {
    const p = await this.personaCollection
      .where('accountId', '==', accountId)
      .where('enabled', '==', true)
      .where('id', 'in', personas)
      .get();

    if (p.empty) {
      return [];
    }

    return p.docs.map((document_) => document_.data());
  }

  async getIdentitiesByIds(
    accountId: string,
    ids: string[],
  ): Promise<PersistentIdentityDto[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const index = await this.identityCollection
      .where('accountId', '==', accountId)
      .where('id', 'in', ids)
      .get();

    if (index.empty) {
      return [];
    }

    return index.docs.map((document_) => document_.data());
  }

  async getPromptTemplates(): Promise<SimulationPromptDto[]> {
    const function_ = 'getPromptTemplates';

    try {
      const promptsSnapshot = await this.promptCollection
        .where('template', '==', true)
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
        message: 'Error retrieving prompt templates',
        error,
      });

      return [];
    }
  }

  async getPromptsByIds(
    accountId: string,
    requiredPromptIds: string[],
  ): Promise<SimulationPromptDto[]> {
    if (!requiredPromptIds || requiredPromptIds.length === 0) {
      return [];
    }

    const p = await this.promptCollection
      .where('accountId', '==', accountId)
      .get();

    const promptDocuments = p.docs.map((document_) => document_.data());

    const templatePrompts = await this.getPromptTemplates();

    // merge and deduplicate by id
    const allPrompts = [...promptDocuments, ...templatePrompts];

    const arrayIds = [];

    for (const prompt of requiredPromptIds) {
      const found = allPrompts.find((p) => p.id === prompt);

      if (found) {
        arrayIds.push(found);
      }
    }

    return arrayIds;
  }

  async getScenariosByIds(
    accountId: string,
    ids: string[],
  ): Promise<ScenarioDto[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const s = await this.scenarioCollection
      .where('accountId', '==', accountId)
      .where('id', 'in', ids)
      .get();

    if (s.empty) {
      return [];
    }

    return s.docs.map((document_) => document_.data());
  }

  async getPersonasByIds(
    accountId: string,
    ids: string[],
  ): Promise<PersonaDto[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const p = await this.personaCollection
      .where('accountId', '==', accountId)
      .where('id', 'in', ids)
      .get();

    if (p.empty) {
      return [];
    }

    return p.docs.map((document_) => document_.data());
  }

  async validateTaskConfiguration(
    accountId: string,
    _categories: string[],
    _identities: string[],
    _personas: string[],
    _scenarios: string[],
    _prompts: string[],
  ): Promise<{
    criticalError: boolean;
    errors: string[];
    identities?: string[];
    personas?: string[];
    scenarios?: string[];
  }> {
    const errors: string[] = [];
    let criticalError = false;

    // Validate required input parameters
    const inputValidation = this.validateRequiredInputs(
      _scenarios,
      _prompts,
      _personas,
      _identities,
    );

    errors.push(...inputValidation.errors);
    criticalError = inputValidation.criticalError;

    // Validate scenarios exist
    const scenarios = await this.getScenariosByIds(accountId, _scenarios);

    if (!scenarios || scenarios.length === 0) {
      errors.push(
        '[ERROR_4] provided scenarios do not exist or are not enabled',
      );

      criticalError = true;
    }

    // Validate personas and identities
    const personaValidation = await this.validatePersonasAndIdentities(
      accountId,
      _personas,
      _identities,
    );

    errors.push(...personaValidation.errors);

    if (personaValidation.criticalError) {
      criticalError = true;
    }

    const filteredPromptIds = _prompts.filter(
      (id) => id && id.trim().length > 0,
    );

    const prompts = await this.getPromptsByIds(accountId, filteredPromptIds);

    if (!prompts || prompts.length === 0) {
      errors.push(
        '[ERROR_7] provided prompts do not exist. Requested prompts: ' +
          _prompts.join(', '),
      );

      criticalError = true;
    }

    return {
      criticalError,
      errors,
      scenarios: scenarios?.map((s) => s.id) || [],
      personas: personaValidation.validPersonas,
      identities: personaValidation.validIdentities,
    };
  }

  /**
   * Validates required input parameters for task configuration
   */
  private validateRequiredInputs(
    scenarios: string[],
    prompts: string[],
    personas: string[],
    identities: string[],
  ): { criticalError: boolean; errors: string[] } {
    const errors: string[] = [];
    let criticalError = false;

    if (!scenarios || scenarios.length === 0) {
      criticalError = true;
      errors.push('[ERROR_1] At least one scenario must be provided');
    }

    if (!prompts || prompts.length === 0) {
      criticalError = true;
      errors.push('[ERROR_2] prompts not provided');
    }

    if (
      (!personas || personas.length === 0) &&
      (!identities || identities.length === 0)
    ) {
      criticalError = true;

      errors.push(
        '[ERROR_3] At least one persona or identity must be provided',
      );
    }

    return { criticalError, errors };
  }

  /**
   * Validates personas and identities configuration
   */
  private async validatePersonasAndIdentities(
    accountId: string,
    _personas: string[],
    _identities: string[],
  ): Promise<{
    criticalError: boolean;
    errors: string[];
    validIdentities: string[];
    validPersonas: string[];
  }> {
    const errors: string[] = [];
    let criticalError = false;

    const personas =
      _personas && _personas.length > 0
        ? await this.getPersonasByIds(accountId, _personas)
        : [];

    const identities =
      _identities && _identities.length > 0
        ? await this.getIdentitiesByIds(accountId, _identities)
        : [];

    const validPersonas: string[] = [];
    const validIdentities: string[] = [];

    const hasNoPersonasOrIdentities =
      (!_identities || _identities.length === 0) &&
      (!personas || personas.length === 0);

    if (hasNoPersonasOrIdentities) {
      errors.push(
        '[ERROR_5] At least one persona or identity must be provided',
      );

      criticalError = true;
    } else {
      const _validPersonas = personas || [];

      validPersonas.push(..._validPersonas.map((p) => p.id));

      // Identities must have a valid persona assigned
      const _validIdentities = identities.filter(
        (index) =>
          index.personaId &&
          _validPersonas.some((p) => p.id === index.personaId),
      );

      validIdentities.push(..._validIdentities.map((index) => index.id));

      if (_identities.length > 0 && _validIdentities.length === 0) {
        errors.push(
          '[ERROR_6] provided identities do not exist or do not have a valid persona assigned',
        );
      }
    }

    return { criticalError, errors, validIdentities, validPersonas };
  }

  /**
   *
   * @param accountId
   * @param scenarioId
   * @return scenario name or null if not found
   * @note attempts to retrieve the scenario from the cache, then database and cache it if found
   */
  async getScenarioNameById(
    accountId: string,
    scenarioId: string,
  ): Promise<string | null> {
    const function_ = 'getScenarioNameById';

    // Check cache
    const cachedScenario = await this.cache.getScenario(accountId, scenarioId);

    if (cachedScenario) {
      return cachedScenario.name;
    }

    // If not found in cache, retrieve from database
    const scenario = await this.getScenario(scenarioId);

    if (scenario) {
      // Cache the scenario for future requests
      await this.cache.addScenario(accountId, scenarioId, scenario);

      return scenario.topic;
    }

    this.logger.warn({
      fn: function_,
      message: `Scenario with ID ${scenarioId} not found for account ${accountId}`,
      accountId,
      scenarioId,
    });

    return null;
  }

  async saveGlobalApplicationSetting(body: {
    name: string;
    value: any;
  }): Promise<GlobalApplicationSettingsDto> {
    const function_ = 'saveGlobalApplicationSetting';

    const existing = await this.globalAppSettingsCollection.limit(1).get();

    const settings: GlobalApplicationSettingsDto = existing.empty
      ? ({} as GlobalApplicationSettingsDto)
      : existing.docs[0].data();

    if (!settings[body.name]) {
      settings[body.name] = {
        name: body.name,
        value: body.value,
        createdAt: Date.now(),
        createdBy: 0,
        updatedAt: Date.now(),
        updatedBy: 0,
      };
    } else {
      settings[body.name] = {
        ...settings[body.name],
        ...body,
        updatedAt: Date.now(),
        updatedBy: 0,
      };
    }

    const done = await this.globalAppSettingsCollection
      .doc('global_app_settings')
      .set(settings);

    if (!done) {
      throw new InternalServerErrorException(
        ...context_(context, function_, 'Error saving application settings'),
      );
    }

    return settings[body.name];
  }

  async getGlobalApplicationSettingsAll(): Promise<GlobalApplicationSettingsDto> {
    const function_ = 'getAllApplicationSettings';

    try {
      const existing = await this.globalAppSettingsCollection
        .doc('global_app_settings')
        .get();

      if (!existing.exists) {
        return {} as GlobalApplicationSettingsDto;
      }

      const settings = existing.data();

      return settings;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting all application settings',
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
      );
    }
  }

  async getGlobalApplicationSettings(): Promise<GlobalApplicationSettingsDto> {
    const function_ = 'getGlobalApplicationSettings';

    try {
      const existing = await this.globalAppSettingsCollection
        .doc('global_app_settings')
        .get();

      if (!existing.exists) {
        return {} as GlobalApplicationSettingsDto;
      }

      const settings = existing.data();

      return settings;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting application settings',
      });

      throw new InternalServerErrorException(
        ...context_(context, function_, error),
      );
    }
  }
}
