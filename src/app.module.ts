import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import * as Joi from 'joi';

import { AuthModule } from 'src/auth/auth.module';
import { PreAuthMiddleware } from './auth/auth.middleware';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { AuditLogService } from './common/services/audit-log.service';
import { CircuitBreakerService } from './common/services/circuit-breaker.service';
import { LpLoggerService } from './common/services/lp-logger.service';
import { MetricsService } from './common/services/metrics.service';
import { RetryService } from './common/services/retry.service';
import { ShutdownService } from './common/services/shutdown.service';
import { EnvironmentService } from './config/environment.service';
import { AccountConfigModule } from './Controllers/AccountConfig/account-config.module';
import { AIStudioModule } from './Controllers/AIStudio/ai-studio.module';
import { APIModule } from './Controllers/APIService/api.module';
import { CachingModule } from './Controllers/Cache/cache.module';
import { AppConfigurationModule } from './Controllers/Configuration/configuration.module';
import { ConnectorAPIModule } from './Controllers/ConnectorAPI/connector-api.module';
import { ConversationCloudModule } from './Controllers/ConversationalCloud/conversation-cloud.module';
import { DatabaseModule } from './Controllers/Database/database.module';
import { HelperModule } from './Controllers/HelperService/helper-service.module';
import { SchedulingModule } from './Controllers/Scheduler/schedule.module';
import { SimulatorController } from './Controllers/Simulation/simulation.controller';
import { SimulationModule } from './Controllers/Simulation/simulation.module';
import { UsersModule } from './Controllers/users/users.module';
import { FirestoreModule } from './firestore/firestore.module';
import { HealthModule } from './health/health.module';
import { MetricsController } from './metrics/metrics.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    NestCacheModule.register({ isGlobal: true }),
    CachingModule,

    // 🔥 CLOUD RUN SAFE CONFIG
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: Joi.object({
        MAX_ACCOUNT_TASKS: Joi.number().integer().min(1).default(3),
        MAX_CONVERSATIONS_LIMIT: Joi.number().integer().min(1).default(100),
        MAX_QUEUING: Joi.number().integer().min(1).default(100),
        MIN_WARM_UP_DELAY: Joi.number().integer().min(1).default(1000),
        MAX_WARM_UP_DELAY: Joi.number().integer().min(1).default(5000),
        LOGGING_ENABLED: Joi.boolean().default(true),
        ZONE: Joi.string().allow('').default('cloud'),
        SCHEDULER_INTERVAL: Joi.number().integer().min(1).default(5000),
        SCHEDULER_CRON: Joi.string().default('*/5 * * * *'),
        PORT: Joi.number().port().default(8080),
        WEBHOOK_ENV: Joi.string().allow('').default('cloud'),
        DEVELOPER_ACCOUNT_ID: Joi.string().allow('').default(''),
        PROJECT_ID: Joi.string().allow('').default(''),
        FIREBASE_PROJECT_ID: Joi.string().allow('').default(''),
        FIRESTORE_DATABASE_ID: Joi.string().allow('').default('(default)'),

        // 🚑 KEY FIX — NOT REQUIRED AT STARTUP
        FIREBASE_SERVICE_ACCOUNT: Joi.string().allow('').optional(),
      }),
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        autoLogging: {
          ignore: (request) =>
            request.url?.includes('/health') ||
            request.url?.includes('/favicon.ico'),
        },
      },
    }),

    // 🔥 SAFE FIRESTORE INIT
    FirestoreModule.forRoot({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const raw = configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
        let credentials;

        try {
          credentials = raw ? JSON.parse(raw) : undefined;
        } catch {
          console.log('⚠️ FIREBASE_SERVICE_ACCOUNT not valid — using default creds');
        }

        return {
          credentials,
          projectId:
            process.env.FIREBASE_PROJECT_ID ||
            configService.get<string>('FIREBASE_PROJECT_ID'),
          databaseId:
            configService.get<string>('FIRESTORE_DATABASE_ID') || '(default)',
        };
      },
      inject: [ConfigService],
    }),

    SimulationModule,
    AppConfigurationModule,
    DatabaseModule,
    APIModule,
    AuthModule,
    AccountConfigModule,
    AIStudioModule,
    ConnectorAPIModule,
    ConversationCloudModule,
    HelperModule,
    UsersModule,
    SchedulingModule,
    ScheduleModule.forRoot(),
    HealthModule,
  ],
  controllers: [MetricsController],
  providers: [
    AppService,
    ShutdownService,
    MetricsService,
    CircuitBreakerService,
    AuditLogService,
    RetryService,
    EnvironmentService,
    LpLoggerService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');

    consumer
      .apply(PreAuthMiddleware)
      .exclude(
        '/api/v1/connector-api/*path',
        '/health/*path',
        '/callback/*path',
        '/logout/*path',
      )
      .forRoutes(SimulatorController);
  }
}
