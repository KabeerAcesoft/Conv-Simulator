import { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager/dist/cache.constants';
import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { uuid } from 'short-uuid';

import {
  CONVERSATION_STATE,
  DIALOG_TYPES,
  ONGOING_SIMULATION_STATUSES,
  SIMULATION_STATUS,
} from 'src/constants/constants';

import {
  QueuedConversation,
  SimulationConversation,
  TaskStatus,
} from '../Simulation/simulation.dto';

@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectPinoLogger(CacheService.name)
    private readonly logger: PinoLogger,
  ) {}

  async getMany(query?: string): Promise<{ key: string; value: any }[]> {
    const store: any = this.cacheManager.stores[0];
    const data = [];

    if (!store?.iterator) {
      return [];
    }

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
    }, 1000);

    for await (const [key, value] of store.iterator({})) {
      if (timedOut) {
        clearTimeout(timeout);

        return null;
      }

      if (query && !key.startsWith(query)) {
        continue;
      }

      data.push({ key, value });
    }

    clearTimeout(timeout);

    return data;
  }

  async get<T = any>(key: string): Promise<T | null | undefined> {
    const data = await this.cacheManager.get<T | undefined>(key);

    return data;
  }

  async set(key: string, value: any, ttl?: number | string): Promise<any> {
    const ttlNumber = typeof ttl === 'string' ? parseInt(ttl, 10) : ttl;

    await this.cacheManager.set(key, value, ttlNumber);

    return value;
  }

  async delete(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async incrementTaskConversationCount(
    requestId: string,
    incrementBy = 1,
  ): Promise<number> {
    if (!requestId) {
      throw new Error(
        'Request ID is required to increment task conversation count',
      );
    }

    const key = `c_count_${requestId}`;
    const lockKey = `lock_${key}`;

    const maxRetries = 10;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const lockAcquired = await this.cacheManager.get(lockKey);

        if (!lockAcquired) {
          await this.cacheManager.set(lockKey, true, 1000); // 1 second lock

          const currentCount = (await this.cacheManager.get<number>(key)) || 0;
          const newCount = currentCount + incrementBy;

          await this.cacheManager.set(key, newCount, 60000 * 60 * 2); // 2 hours

          await this.cacheManager.del(lockKey);

          return newCount;
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } catch (error) {
        await this.cacheManager.del(lockKey);

        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to acquire lock for incrementing conversation count after ${maxRetries} attempts`,
    );
  }

  async decrementTaskConversationCount(
    requestId: string,
    decrementBy = 1,
  ): Promise<number> {
    if (!requestId) {
      throw new Error(
        'Request ID is required to decrement task conversation count',
      );
    }

    const key = `c_count_${requestId}`;
    const lockKey = `lock_${key}`;

    const maxRetries = 10;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const lockAcquired = await this.cacheManager.get(lockKey);

        if (!lockAcquired) {
          await this.cacheManager.set(lockKey, true, 1000); // 1 second lock

          const currentCount = (await this.cacheManager.get<number>(key)) || 0;
          const newCount = Math.max(0, currentCount - decrementBy);

          await this.cacheManager.set(key, newCount, 60000 * 60 * 2); // 2 hours

          await this.cacheManager.del(lockKey);

          return newCount;
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } catch (error) {
        await this.cacheManager.del(lockKey);

        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to acquire lock for decrementing conversation count after ${maxRetries} attempts`,
    );
  }

  async getTaskConversationCount(requestId: string): Promise<number> {
    if (!requestId) {
      throw new Error('Account ID is required to get task conversation count');
    }

    const key = `c_count_${requestId}`;
    const currentCount = (await this.cacheManager.get<number>(key)) || 0;

    return currentCount;
  }

  async getQueuedConversations(): Promise<QueuedConversation[]> {
    const values = (await this.get(`queued_conversations`)) || [];

    return values as QueuedConversation[];
  }

  async addToQueuedConversations(
    accountId: string,
    requestId: string,
    toAdd: number,
  ): Promise<void> {
    if (!requestId || !accountId || toAdd <= 0) {
      throw new Error(
        'Both Request ID and Account ID are required to add to queued conversations',
      );
    }

    const key = `queued_conversations`;

    const existingConversations =
      (await this.get<QueuedConversation[]>(key)) || [];

    for (let index = 0; index < toAdd; index++) {
      existingConversations.push({ requestId, accountId, id: uuid() });
    }

    await this.set(key, existingConversations, 60000 * 60 * 1);
  }

  async nextQueuedConversation(): Promise<QueuedConversation | null> {
    const key = `queued_conversations`;

    const existingConversations =
      (await this.get<QueuedConversation[]>(key)) || [];

    if (existingConversations.length === 0) {
      return null;
    }

    const nextConversation = existingConversations[0];
    const toSet = existingConversations.slice(1);

    await this.set(key, toSet);

    return nextConversation;
  }

  async nextQueuedConversations(
    N: number,
  ): Promise<QueuedConversation[] | null> {
    const key = `queued_conversations`;

    const existingConversations =
      (await this.get<QueuedConversation[]>(key)) || [];

    if (existingConversations.length === 0) {
      return null;
    }

    if (N <= 0) {
      return null;
    }

    if (N > existingConversations.length) {
      N = existingConversations.length;
    }

    const nextConversations = existingConversations.slice(0, N);

    existingConversations.splice(0, N);
    await this.set(key, existingConversations);

    return nextConversations;
  }

  async getQueue() {
    const key = `queued_conversations`;

    const existingConversations =
      (await this.get<QueuedConversation[]>(key)) || [];

    return existingConversations;
  }

  async setQueue(conversations: QueuedConversation[]): Promise<void> {
    const key = `queued_conversations`;

    await this.set(key, conversations, 60000 * 60 * 1);
  }

  async addBackToQueuedConversations(
    requestId: string,
    accountId: string,
    id: string,
  ): Promise<void> {
    if (!requestId || !accountId) {
      throw new Error(
        'Both Request ID and Account ID are required to add back to queued conversations',
      );
    }

    const key = `queued_conversations`;

    const existingConversations =
      (await this.get<QueuedConversation[]>(key)) || [];

    existingConversations.unshift({ requestId, accountId, id });
    await this.set(key, existingConversations, 60000 * 60 * 1);
  }

  async getTasksByUserId(
    accountId: string,
    userId: string,
  ): Promise<TaskStatus[]> {
    if (!accountId || !userId) {
      throw new Error(
        'Both Account ID and User ID are required to get tasks by user ID',
      );
    }

    const keyPattern = `task_${accountId}`;
    const taskRecords = await this.getMany(keyPattern);
    const tasks = [];

    for (const taskRecord of taskRecords) {
      const t = taskRecord?.value?.task;

      if (
        t?.status === SIMULATION_STATUS.IN_PROGRESS ||
        t?.createdBy === Number(userId)
      ) {
        tasks.push(t);
      }

      if (
        t?.status === SIMULATION_STATUS.ERROR ||
        t?.status === SIMULATION_STATUS.COMPLETED ||
        t?.status === SIMULATION_STATUS.CANCELLED
      ) {
        await this.delete(taskRecord.key);
      }
    }

    return tasks;
  }

  async addTask(
    accountId: string,
    requestId: string,
    task: TaskStatus,
  ): Promise<void> {
    if (!accountId || !requestId || !task) {
      throw new Error(
        'Account ID, Request ID, and Task are required to add a task to cache',
      );
    }

    const key = requestId;

    await this.set(key, task, 60000 * 60 * 2);
  }

  async updateTask(
    accountId: string,
    requestId: string,
    task: Partial<TaskStatus>,
  ): Promise<void> {
    if (!accountId || !requestId) {
      throw new Error(
        'Both Account ID and Request ID are required to set tasks cache',
      );
    }

    const key = requestId;
    const existingData = (await this.get<Record<any, any>>(key)) || {};

    const updatedData = {
      ...existingData,
      accountId,
      requestId,
      task,
      updatedAt: Date.now(),
    };

    await this.set(key, updatedData, 60000 * 60 * 3);
  }

  async clearInvalidTasks() {
    const tasks = await this.getMany('task_');

    for (const task of tasks) {
      if (!task.value?.accountId || !task.value.requestId) {
        this.logger.warn({
          message: `Invalid task found in cache`,
          task,
          service: CacheService.name,
          function: 'clearInvalidTasks',
        });

        await this.delete(task.key);
      }
    }
  }

  async getTask(accountId: string, requestId: string): Promise<any> {
    if (!accountId || !requestId) {
      throw new Error(
        'Both Account ID and Request ID are required to get tasks cache',
      );
    }

    const key = requestId;
    const data = await this.get(key);

    if (!data) {
      return;
    }

    return data;
  }

  async deleteTask(accountId: string, requestId: string): Promise<void> {
    if (!accountId || !requestId) {
      throw new Error(
        'Both Account ID and Request ID are required to delete tasks cache',
      );
    }

    const key = requestId;

    await this.delete(key);
  }

  async getAllAccountsByRunningTasks(): Promise<string[]> {
    const tasks = await this.getMany('task_');
    const accounts = new Set<string>();

    for (const t of tasks) {
      const task = t.value.task as TaskStatus;

      if (!task?.accountId) {
        continue;
      }

      if (t.value.task.status === SIMULATION_STATUS.IN_PROGRESS) {
        accounts.add(task.accountId);
      }
    }

    return Array.from(accounts);
  }

  async getAllRunningTasks(): Promise<TaskStatus[]> {
    const tasks = await this.getMany('task_');

    const runningTasks = tasks
      .map((t) => t.value.task as TaskStatus)
      .filter((task) => task && task.status === SIMULATION_STATUS.IN_PROGRESS);

    return runningTasks;
  }

  async getAllTasks(): Promise<TaskStatus[]> {
    const _tasks = await this.getMany('task_');

    if (!_tasks || _tasks.length === 0) {
      return [];
    }

    return _tasks.map((item) => item.value as TaskStatus);
  }

  async getAllTasksForAccount(accountId: string): Promise<any[]> {
    if (!accountId) {
      throw new Error('Account ID is required to get all tasks cache');
    }

    const keyPattern = `task_${accountId}`;
    const tasks = await this.getMany(keyPattern);

    if (!tasks || tasks.length === 0) {
      return [];
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Tasks data is not in the expected format');
    }

    return tasks.map((item) => item.value as TaskStatus);
  }

  async getAllActiveTasksForAccount(accountId: string): Promise<TaskStatus[]> {
    if (!accountId) {
      throw new Error('Account ID is required to get all active tasks');
    }

    const keyPattern = `task_${accountId}`;
    const tasks = await this.getMany(keyPattern);

    if (!tasks || tasks.length === 0) {
      return [];
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Tasks data is not in the expected format');
    }

    if (tasks.length === 0) {
      return [];
    }

    return tasks
      .map((item) => item.value.task as TaskStatus)
      .filter(
        (task) => task && ONGOING_SIMULATION_STATUSES.includes(task.status),
      );
  }

  async getActiveTasksByUserId(
    accountId: string,
    userId: string,
  ): Promise<TaskStatus[]> {
    if (!accountId || !userId) {
      throw new Error(
        'Both Account ID and User ID are required to get active tasks by user ID',
      );
    }

    const keyPattern = `task_${accountId}`;
    const tasks = await this.getMany(keyPattern);

    if (!tasks || tasks.length === 0) {
      return [];
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Tasks data is not in the expected format');
    }

    if (tasks.length === 0) {
      return [];
    }

    return tasks
      .map((item) => item.value as TaskStatus)
      .filter(
        (task) =>
          task &&
          ONGOING_SIMULATION_STATUSES.includes(task.status) &&
          task.createdBy === Number(userId),
      );
  }

  async getAllTasksByAccount(accountId: string): Promise<TaskStatus[]> {
    if (!accountId) {
      throw new Error('Account ID is required to get all tasks by account');
    }

    const keyPattern = `task_${accountId}`;
    const tasks = await this.getMany(keyPattern);

    if (!tasks || tasks.length === 0) {
      return [];
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Tasks data is not in the expected format');
    }

    return tasks.map((item) => item.value as TaskStatus);
  }

  async addConversation(
    accountId: string,
    conversation: SimulationConversation,
  ): Promise<void> {
    if (!accountId || !conversation) {
      throw new Error(
        'Both Account ID and Conversation are required to add a conversation',
      );
    }

    const key = `conversation_${accountId}:${conversation.id}`;

    await this.set(key, conversation, 60000 * 60 * 4);
  }

  async updateConversation(
    accountId: string,
    conversationId: string,
    conversation: Partial<SimulationConversation>,
  ): Promise<void> {
    if (!accountId || !conversationId) {
      throw new Error(
        'Both Account ID and Conversation ID are required to update a conversation',
      );
    }

    const key = `conversation_${accountId}:${conversationId}`;

    const existingData =
      (await this.get<Partial<SimulationConversation>>(key)) || {};

    const updatedData = {
      ...existingData,
      ...conversation,
      id: conversationId,
      accountId,
      updatedAt: Date.now(),
    };

    await this.set(key, updatedData, 60000 * 60 * 1);
  }

  async removeConversation(
    accountId: string,
    conversationId: string,
  ): Promise<void> {
    if (!accountId || !conversationId) {
      throw new Error(
        'Both Account ID and Conversation ID are required to remove a conversation',
      );
    }

    const key = `conversation_${accountId}:${conversationId}`;

    await this.delete(key);
  }

  async getConversation(
    accountId: string,
    conversationId: string,
  ): Promise<SimulationConversation | undefined> {
    if (!accountId || !conversationId) {
      throw new Error(
        'Both Account ID and Conversation ID are required to get a conversation',
      );
    }

    const key = `conversation_${accountId}:${conversationId}`;

    return await this.get<SimulationConversation>(key);
  }

  async getAllConversationsGlobal(): Promise<SimulationConversation[]> {
    const keyPattern = `conversation_`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations;
  }

  async getAllConversations(
    accountId: string,
  ): Promise<SimulationConversation[]> {
    if (!accountId) {
      throw new Error('Account ID is required to get all conversations');
    }

    const keyPattern = `conversation_${accountId}:*`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations;
  }

  async getConversationsByRequestId(
    accountId: string,
    requestId: string,
  ): Promise<SimulationConversation[]> {
    if (!accountId || !requestId) {
      throw new Error(
        'Both Account ID and Request ID are required to get conversations by request ID',
      );
    }

    const keyPattern = `conversation_${accountId}:`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations.filter(
      (conversation) =>
        conversation.requestId === requestId &&
        conversation.accountId === accountId,
    );
  }

  async getConversationsByUserId(accountId: string, createdBy: string) {
    if (!accountId || !createdBy) {
      throw new Error(
        'Both Account ID and Created By (User ID) are required to get conversations by user ID',
      );
    }

    const keyPattern = `conversation_${accountId}:`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations.filter(
      (conversation) => conversation.createdBy === Number(createdBy),
    );
  }

  async getActiveConversationsByCustomerId(
    accountId: string,
    customerId: string,
  ) {
    if (!accountId || !customerId) {
      return [];
    }

    const keyPattern = `conversation_${accountId}:`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations.filter(
      (conversation) =>
        conversation.customerId === customerId &&
        conversation.status === CONVERSATION_STATE.OPEN,
    );
  }

  async getAllActiveConversations(): Promise<SimulationConversation[]> {
    const keyPattern = 'conversation_';

    return await this.getMany(keyPattern).then((conversations) => {
      return conversations
        .map((item) => item.value as SimulationConversation)
        .filter((conversation) => {
          return (
            conversation.status === CONVERSATION_STATE.OPEN ||
            conversation.dialogType === DIALOG_TYPES.POST_SURVEY
          );
        });
    });
  }

  async getActiveConversations(
    accountId: string,
  ): Promise<SimulationConversation[]> {
    const keyPattern = `conversation_${accountId}:`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations.filter(
      (conversation) => conversation.status === CONVERSATION_STATE.OPEN,
    );
  }

  async getActiveConversationsByAccountId(
    accountId: string,
    log?: boolean,
  ): Promise<SimulationConversation[]> {
    if (!accountId) {
      throw new Error('Account ID is required to get active conversations');
    }

    const keyPattern = `conversation_${accountId}:`;

    const conversations = ((await this.getMany(keyPattern)) || []).map(
      (item) => item.value as SimulationConversation,
    );

    return conversations.filter(
      (conversation) => conversation.status === CONVERSATION_STATE.OPEN,
    );
  }

  async getActiveConversationDetails(
    accountId: string,
    requestId: string,
  ): Promise<{
    account: number;
    request: number;
  }> {
    if (!accountId || !requestId) {
      throw new Error(
        'Both Account ID and Request ID are required to get active conversation details',
      );
    }

    const activeConversations =
      await this.getActiveConversationsByAccountId(accountId);

    const requestConversations = activeConversations.filter(
      (conversation) => conversation.requestId === requestId,
    ).length;

    return {
      account: activeConversations.length,
      request: requestConversations,
    };
  }

  async getTaskStatusByUserId(
    accountId: string,
    userId: string,
  ): Promise<{
    conversations: SimulationConversation[];
    task: TaskStatus;
  }> {
    try {
      const activeTasks = await this.getActiveTasksByUserId(accountId, userId);

      if (!activeTasks || activeTasks.length === 0) {
        return null;
      }

      const task = activeTasks[0];

      const conversations =
        (await this.getConversationsByRequestId(accountId, task.requestId)) ||
        [];

      return {
        conversations,
        task,
      };
    } catch (error) {
      this.logger.info({
        fn: 'getTaskStatusByUserId',
        message: 'Error getting task status by user ID',
        accountId,
        userId,
        error: error.message || error,
      });

      throw error;
    }
  }

  async setServiceWorker(accountId: string, token: string): Promise<void> {
    if (!token) {
      throw new Error('Service worker token is required');
    }

    if (!accountId) {
      throw new Error('Account ID is required to set service worker');
    }

    const key = `service_worker_${accountId}`;

    await this.set(key, { token }, 60000 * 60 * 8);
  }

  async getServiceWorker(accountId: string): Promise<{
    token: string;
  }> {
    if (!accountId) {
      throw new Error('Account ID is required to get service worker');
    }

    const key = `service_worker_${accountId}`;

    const data = await this.get<{
      token: string;
    }>(key);

    return data;
  }

  async setPrompt(
    accountId: string,
    promptId: string,
    prompt: string,
  ): Promise<void> {
    if (!accountId || !promptId || !prompt) {
      throw new Error(
        'Account ID, Prompt ID, and Prompt are required to set a prompt in cache',
      );
    }

    const key = `prompt_${accountId}:${promptId}`;

    await this.set(key, prompt, 60000 * 60 * 2);
  }

  async getPrompt(
    accountId: string,
    promptId: string,
  ): Promise<string | undefined> {
    if (!accountId || !promptId) {
      throw new Error(
        'Both Account ID and Prompt ID are required to get a prompt from cache',
      );
    }

    const key = `prompt_${accountId}:${promptId}`;

    return await this.get<string>(key);
  }

  async getPromptById(promptId: string): Promise<string | undefined> {
    if (!promptId) {
      throw new Error('Prompt ID is required to get a prompt from cache');
    }

    const key = `prompt_${promptId}`;

    return await this.get<string>(key);
  }

  async setAccountSettings(
    accountId: string,
    settings: Record<string, any>,
  ): Promise<void> {
    if (!accountId || !settings) {
      throw new Error(
        'Both Account ID and Settings are required to set account settings cache',
      );
    }

    const key = `account_settings_${accountId}`;

    await this.set(key, settings, 60000 * 60 * 4); // 4 hours
  }

  async getAccountSettings(accountId: string): Promise<any> {
    if (!accountId) {
      throw new Error('Account ID is required to get account settings cache');
    }

    const key = `account_settings_${accountId}`;
    const data = await this.get(key);

    if (!data) {
      throw new Error(`No settings found for account ID: ${accountId}`);
    }

    return data;
  }

  async getAccountSetting(accountId: string, settingKey: string): Promise<any> {
    if (!accountId || !settingKey) {
      throw new Error(
        'Both Account ID and Setting Key are required to get a specific account setting',
      );
    }

    const settings = await this.getAccountSettings(accountId);

    if (
      !settings ||
      !Object.prototype.hasOwnProperty.call(settings, settingKey)
    ) {
      throw new Error(
        `Setting ${settingKey} not found for account ID: ${accountId}`,
      );
    }

    const descriptor = Object.getOwnPropertyDescriptor(settings, settingKey);

    return descriptor?.value;
  }

  async getAppJwt(accountId: string) {
    const key = `CR_${accountId}_connector_app_jwt`;

    return await this.get<string>(key);
  }

  async setAppJwt(
    accountId: string,
    appJwt: string,
    ttl?: number,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('Account ID is required to set App JWT');
    }

    const key = `CR_${accountId}_connector_app_jwt`;

    await this.set(
      key,
      appJwt,
      ttl || 60000 * 60 * 0.5, // 30 mins
    );
  }

  async addPersona(
    accountId: string,
    personaId: string,
    persona: {
      persona: string;
      personaId: string;
      personaName: string;
    },
  ): Promise<void> {
    if (!accountId || !personaId || !persona) {
      throw new Error(
        'Account ID, Persona Item, and Persona ID are required to add a persona to cache',
      );
    }

    const key = `persona_${accountId}:${personaId}`;

    await this.set(key, persona, 60000 * 60 * 2); // 2 hours
  }

  async getPersona(
    accountId: string,
    personaId: string,
  ): Promise<{
    persona: string;
    personaId: string;
    personaName: string;
  }> {
    if (!accountId || !personaId) {
      throw new Error(
        'Both Account ID and Persona ID are required to get a persona from cache',
      );
    }

    const key = `persona_${accountId}:${personaId}`;

    return await this.get<{
      persona: string;
      personaId: string;
      personaName: string;
    }>(key);
  }

  async addScenario(
    accountId: string,
    id: string,
    scenario: any,
  ): Promise<void> {
    if (!accountId || !id || !scenario) {
      throw new Error(
        'Account ID, Scenario ID, and Scenario are required to add a scenario to cache',
      );
    }

    const key = `scenario_${accountId}:${id}`;

    await this.set(key, scenario, 60000 * 60 * 2); // 2 hours
  }

  async getScenario(accountId: string, id: string): Promise<any> {
    if (!accountId || !id) {
      throw new Error(
        'Account ID and Scenario ID are required to get a scenario from cache',
      );
    }

    const key = `scenario_${accountId}:${id}`;

    return await this.get(key);
  }

  async setMaxConversationLimit(
    requestId: string,
    maxConversations: number,
  ): Promise<void> {
    if (!requestId || maxConversations <= 0) {
      throw new Error(
        'Request ID and a valid maximum conversation limit are required',
      );
    }

    const key = `max_conversations_${requestId}`;

    await this.set(key, maxConversations, 60000 * 60 * 4); // 24 hours
  }

  async getMaxConversationLimit(requestId: string): Promise<number> {
    if (!requestId) {
      throw new Error('Request ID is required to get max conversation limit');
    }

    const key = `max_conversations_${requestId}`;
    const limit = await this.get<number>(key);

    if (limit === undefined) {
      throw new Error(
        `No max conversation limit found for request ID: ${requestId}`,
      );
    }

    return limit;
  }
}
