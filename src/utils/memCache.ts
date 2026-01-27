import {
  SimulationConversation,
  TaskStatus,
} from 'src/Controllers/Simulation/simulation.dto';

/**
 * Memcache in use for CDCS only
 * LP Domains for cached per region
 */

export class CacheItem {
  ttl: number;
  value: any;

  constructor(ttl: number, value: any) {
    this.ttl = ttl;
    this.value = value;
  }
}

export class ConversationCacheItem {}

export class GlobalAppCache {
  cache: Record<string, CacheItem> = {};
  conversationQueue: {
    accountId: string;
    taskId: string;
  }[];

  constructor() {
    this.conversationQueue = [];
  }

  queuedByAccount(accountId: string): number {
    return this.conversationQueue.filter((item) => item.accountId === accountId)
      .length;
  }
  addToQueue(accountId: string, taskId: string): void {
    this.conversationQueue.push({ accountId, taskId });
  }
  removeFromQueue(accountId: string, taskId: string): void {
    this.conversationQueue = this.conversationQueue.filter(
      (item) => !(item.accountId === accountId && item.taskId === taskId),
    );
  }
  popFromQueue(): { accountId: string; taskId: string } | null {
    if (this.conversationQueue.length > 0) {
      return this.conversationQueue.shift() || null;
    }

    return null;
  }
  getQueue(): { accountId: string; taskId: string }[] {
    return this.conversationQueue;
  }
  getAccountQueue(accountId: string): { accountId: string; taskId: string }[] {
    return this.conversationQueue.filter(
      (item) => item.accountId === accountId,
    );
  }
  getTaskQueue(taskId: string): { accountId: string; taskId: string }[] {
    return this.conversationQueue.filter((item) => item.taskId === taskId);
  }
}

export class MemCache {
  cache: Record<string, CacheItem> = {};
  conversations: SimulationConversation[] = [];
  conversationHistory: string[] = [];
  tasks: TaskStatus[] = [];
  token: string;
  scenarios: Record<string, string> = {};
  personas: Record<string, string> = {};
  isQueuing = false;
  conversationCount = 0;
  conversationLimit = 1; // Default limit for conversations

  setLimit(limit: number): void {
    this.conversationLimit = limit;
    this.conversationCount = 0; // Reset count when limit is set
  }

  getLimit(): number {
    return this.conversationLimit;
  }

  incrementConversationCount(): void {
    this.conversationCount++;
  }
  getConversationCount(): number {
    return this.conversationCount;
  }
  resetConversationCount(): void {
    this.conversationCount = 0;
  }

  getAll(): Record<string, CacheItem> {
    const now = Date.now();
    const validCache: Record<string, CacheItem> = {};

    for (const key in this.cache) {
      if (!Object.prototype.hasOwnProperty.call(this.cache, key)) continue;

      const descriptor = Object.getOwnPropertyDescriptor(this.cache, key);
      const item = descriptor?.value;

      if (item && item.ttl > now) {
        Object.defineProperty(validCache, key, {
          value: item,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      } else {
        Reflect.deleteProperty(this.cache, key);
      }
    }

    return validCache;
  }

  replace(id: string, value: any, ttlSeconds: number): void {
    const descriptor = Object.getOwnPropertyDescriptor(this.cache, id);
    const item = descriptor?.value;

    if (item) {
      item.value = value;
      item.ttl = Date.now() + ttlSeconds * 1000;
    } else {
      this.add(id, value, ttlSeconds);
    }
  }

  getSynthConversations(): any[] {
    const synthConversations: any[] = [];

    for (const key in this.cache) {
      if (!key.startsWith('synth_conv_')) continue;

      if (!Object.prototype.hasOwnProperty.call(this.cache, key)) continue;

      const descriptor = Object.getOwnPropertyDescriptor(this.cache, key);
      const item = descriptor?.value;

      if (item && item.ttl > Date.now()) {
        synthConversations.push(item.value);
      } else {
        Reflect.deleteProperty(this.cache, key);
      }
    }

    return synthConversations;
  }

  get(key: string): any | null {
    const descriptor = Object.getOwnPropertyDescriptor(this.cache, key);
    const item = descriptor?.value;

    if (item) {
      if (item.ttl > Date.now()) {
        return item.value;
      } else {
        Reflect.deleteProperty(this.cache, key);
      }
    }

    return null;
  }

  delete(key: string): void {
    Reflect.deleteProperty(this.cache, key);
  }

  updateProperty(key: string, property: string, value: any): void {
    const descriptor = Object.getOwnPropertyDescriptor(this.cache, key);
    const item = descriptor?.value;

    if (item) {
      Object.defineProperty(item.value, property, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      const newObject = {};

      Object.defineProperty(newObject, property, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });

      this.add(key, newObject, 60000 /* default ttl */);
    }
  }

  removeFromArray(key: string, value: any): void {
    const descriptor = Object.getOwnPropertyDescriptor(this.cache, key);
    const item = descriptor?.value;

    if (item) {
      const index = item.value.indexOf(value);

      if (index !== -1) {
        item.value.splice(index, 1);
      }
    }
  }

  addToArray(key: string, value: any, unique?: boolean): void {
    const descriptor = Object.getOwnPropertyDescriptor(this.cache, key);
    const item = descriptor?.value;

    if (item) {
      if (unique) {
        const index = item.value.indexOf(value);

        if (index === -1) {
          item.value.push(value);
        }
      } else {
        item.value.push(value);
      }
    } else {
      this.add(key, [value], 60000 /* default ttl */);
    }
  }

  add(key: string, value: any, ttlSeconds: number): void {
    Object.defineProperty(this.cache, key, {
      value: new CacheItem(Date.now() + ttlSeconds * 1000, value),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  /* prompt Variable cache */
  // should be cleared on every task init
  addScenario(scenarioId: string, scenario: string): void {
    if (!scenarioId) {
      throw new Error('[addScenario] Scenario ID is required');
    }

    if (!scenario) {
      throw new Error('Scenario is required');
    }

    Object.defineProperty(this.scenarios, scenarioId, {
      value: scenario,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  getScenario(scenarioId: string): string | null {
    if (!scenarioId) {
      throw new Error('[getScenario] Scenario ID is required');
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      this.scenarios,
      scenarioId,
    );

    return descriptor?.value || null;
  }

  addPersona(personaId: string, persona: string): void {
    if (!personaId) {
      throw new Error('Persona ID is required');
    }

    if (!persona) {
      throw new Error('Persona is required');
    }

    Object.defineProperty(this.personas, personaId, {
      value: persona,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  getPersona(personaId: string): string | null {
    if (!personaId) {
      throw new Error('Persona ID is required');
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      this.personas,
      personaId,
    );

    return descriptor?.value || null;
  }

  clearScenarios(): void {
    this.scenarios = {};
  }
  clearPersonas(): void {
    this.personas = {};
  }
  getQueuingState(): boolean {
    return this.isQueuing;
  }
  setQueuingState(queuing: boolean): void {
    this.isQueuing = queuing;
  }
}

export const cache = new MemCache();

export class AccountCache {
  private caches: Record<string, MemCache> = {};

  getCache(accountId: string): MemCache {
    const descriptor = Object.getOwnPropertyDescriptor(this.caches, accountId);
    let cache = descriptor?.value;

    if (!cache) {
      cache = new MemCache();

      Object.defineProperty(this.caches, accountId, {
        value: cache,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return cache;
  }

  getAllCaches(): Record<string, MemCache> {
    return this.caches;
  }
}

const memcaches: Record<string, MemCache> = {};

export const getAllCaches = (): Record<string, MemCache> => {
  return memcaches;
};

export const accountCache = (accountId: string): MemCache => {
  if (!accountId) {
    throw new Error('Account ID is required');
  }

  const descriptor = Object.getOwnPropertyDescriptor(memcaches, accountId);
  let cache = descriptor?.value;

  if (!cache) {
    cache = new MemCache();

    Object.defineProperty(memcaches, accountId, {
      value: cache,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return cache;
};

export const globalCache = new GlobalAppCache();
