import * as Joi from 'joi';

export const configurationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  // Database configuration
  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_SERVICE_ACCOUNT: Joi.string().required(),

  // Redis/Cache configuration
  REDIS_URL: Joi.string().required(),
  CACHE_TTL: Joi.number().default(3600),

  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),

  // API Keys and external services
  OPENAI_API_KEY: Joi.string().required(),
  LIVEPERSON_APP_KEY: Joi.string().required(),
  LIVEPERSON_APP_SECRET: Joi.string().required(),

  // Rate limiting
  RATE_LIMIT_TTL: Joi.number().default(60000), // 1 minute
  RATE_LIMIT_MAX: Joi.number().default(100), // 100 requests per minute

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),

  // Health check thresholds
  MEMORY_HEAP_THRESHOLD: Joi.number().default(300 * 1024 * 1024), // 300MB
  MEMORY_RSS_THRESHOLD: Joi.number().default(1024 * 1024 * 1024), // 1GB
  DISK_THRESHOLD_PERCENT: Joi.number().min(0).max(1).default(0.9), // 90%

  // Application limits
  MAX_CONCURRENT_CONVERSATIONS: Joi.number().default(10),
  MAX_CONVERSATION_DURATION: Joi.number().default(3600000), // 1 hour
  MAX_FILE_SIZE: Joi.number().default(10 * 1024 * 1024), // 10MB

  // Timeouts
  HTTP_TIMEOUT: Joi.number().default(30000), // 30 seconds
  DATABASE_TIMEOUT: Joi.number().default(10000), // 10 seconds
  CACHE_TIMEOUT: Joi.number().default(5000), // 5 seconds
});

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  REDIS_URL: string;
  CACHE_TTL: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  OPENAI_API_KEY: string;
  LIVEPERSON_APP_KEY: string;
  LIVEPERSON_APP_SECRET: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
  LOG_LEVEL: string;
  MEMORY_HEAP_THRESHOLD: number;
  MEMORY_RSS_THRESHOLD: number;
  DISK_THRESHOLD_PERCENT: number;
  MAX_CONCURRENT_CONVERSATIONS: number;
  MAX_CONVERSATION_DURATION: number;
  MAX_FILE_SIZE: number;
  HTTP_TIMEOUT: number;
  DATABASE_TIMEOUT: number;
  CACHE_TIMEOUT: number;
}
