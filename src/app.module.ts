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

const environment = (process.env.NODE_ENV || '').trim();

import { AuthModule } from 'src/auth/auth.module';

/* authentication & logging */
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
/* modules */
import { AppService } from './app.service';

@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
    }),
    CachingModule,
    ConfigModule.forRoot({
      envFilePath:
        process.env.NODE_ENV === 'development' ? '.development.env' : '.env',
      isGlobal: true,
      cache: true,
      validationSchema: Joi.object({
        MAX_ACCOUNT_TASKS: Joi.number().integer().required().min(1).default(3),
        MAX_CONVERSATIONS_LIMIT: Joi.number()
          .integer()
          .required()
          .min(1)
          .default(100),
        MAX_QUEUING: Joi.number().integer().required().min(1).default(100),
        MIN_WARM_UP_DELAY: Joi.number()
          .integer()
          .required()
          .min(1)
          .default(1000),
        MAX_WARM_UP_DELAY: Joi.number()
          .integer()
          .required()
          .min(1)
          .default(5000),
        LOGGING_ENABLED: Joi.boolean().required(),
        ZONE: Joi.string().required(),
        SCHEDULER_INTERVAL: Joi.number()
          .integer()
          .required()
          .min(1)
          .default(5000),
        SCHEDULER_CRON: Joi.string().required().default('*/5 * * * *'),
        PROJECT_ID: Joi.string().required(),
        FIREBASE_PROJECT_ID: Joi.string().required(),
        PORT: Joi.number().port().required(),
        WEBHOOK_ENV: Joi.string().required(),
        DEVELOPER_ACCOUNT_ID: Joi.string().required(),
        FIREBASE_SERVICE_ACCOUNT: Joi.string()
          .custom((value, helpers) => {
            if (!value) return helpers.error('any.required');
            try {
              const object = JSON.parse(value);

              const requiredKeys = [
                'type',
                'project_id',
                'private_key_id',
                'private_key',
                'client_email',
                'client_id',
                'auth_uri',
                'token_uri',
                'auth_provider_x509_cert_url',
                'client_x509_cert_url',
                'universe_domain',
              ];

              for (const key of requiredKeys) {
                if (!(key in object)) {
                  return helpers.error('any.custom', {
                    message: `Missing key: ${key}`,
                  });
                }
              }

              return value;
            } catch (error) {
              return helpers.error('any.custom', {
                message: 'FIREBASE_SERVICE_ACCOUNT must be valid JSON' + error,
              });
            }
          }, 'firebase service account JSON validation')
          .required(),
        FIRESTORE_DATABASE_ID: Joi.string().required(),
      }),
      validationOptions: {
        abortEarly: true,
      },
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        // Only use pretty formatting in development
        ...(environment === 'development' && {
          transport: {
            target: 'pino-pretty',
            options: {
              levelFirst: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname,reqId,req,res',
              messageFormat:
                '{req.method} {req.url} {res.statusCode} {res.responseTime}ms {msg}',
              colorize: true,
            },
          },
        }),
        autoLogging: {
          ignore: (request) =>
            request.url?.includes('/health') ||
            request.url?.includes('/favicon.ico'),
        },
      },
    }),

    FirestoreModule.forRoot({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const serviceAccount = JSON.parse(
          configService.get<string>('FIREBASE_SERVICE_ACCOUNT').trim(),
        );

        const firebaseServiceAccountProjectId = process.env.FIREBASE_PROJECT_ID;

        const firestoreDatabaseId = configService
          .get<string>('FIRESTORE_DATABASE_ID')
          .trim();

        console.log({
          fn: 'FirestoreModule',
          message: 'Initializing FirestoreModule with projectId',
          firebaseServiceAccountProjectId,
        });

        return {
          credentials: serviceAccount,
          projectId: firebaseServiceAccountProjectId
            ? firebaseServiceAccountProjectId
            : configService.get<string>('FIREBASE_PROJECT_ID').trim(),
          databaseId: firestoreDatabaseId,
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
    // Apply security middleware globally
    consumer.apply(SecurityMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });

    /*
    /(.*)". In previous versions, the symbols ?, *, and + were used to denote optional or repeating path parameters. The latest version of "path-to-regexp" now requires the use of named parameters. For example, instead of using a route like /users/* to capture all routes starting with "/users", you should use /users/*path. For more details, refer to the migration guide. Attempting to auto-convert...
    */

    consumer
      .apply(PreAuthMiddleware)
      .exclude(
        {
          path: '/api/v1/connector-api/*path',
          method: RequestMethod.ALL,
        },
        {
          path: '/health/*path',
          method: RequestMethod.ALL,
        },
        '/callback/*path',
        '/logout/*path',
      )
      .forRoutes(SimulatorController);
  }
}
