import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { Firestore } from '@google-cloud/firestore';
import * as bodyParser from 'body-parser';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { TracingInterceptor } from './common/interceptors/tracing.interceptor';
import { ValidationPipe as CustomValidationPipe } from './common/pipes/validation.pipe';
import { LpLoggerService } from './common/services/lp-logger.service';
import { ShutdownService } from './common/services/shutdown.service';
import { EnvironmentService } from './config/environment.service';
import { FirestoreDatabaseProvider } from './firestore/firestore.providers';
import { printStartUp } from './utils/common';
import { AppModule } from './app.module';

const environment = (process.env.NODE_ENV || '').trim();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    snapshot: true,
    abortOnError: false,
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const logger = app.get(Logger);
  const lpLogger = app.get(LpLoggerService);

  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const httpAdapterHost = app.get(HttpAdapterHost);
  const shutdownService = app.get(ShutdownService);
  const environmentService = app.get(EnvironmentService);
  const database = app.get<Firestore>(FirestoreDatabaseProvider as any);

  async function testFirestoreStartup() {
    const testCollection = '_startup_tests';
    const documentId = `startup-${Date.now()}`;
    const payload = { docId: documentId, ts: Date.now(), status: 'ok' };

    try {
      await database.collection(testCollection).doc(documentId).set(payload);

      const snap = await database
        .collection(testCollection)
        .doc(documentId)
        .get();

      lpLogger.log({
        fn: 'testFirestoreStartup',
        message: 'Created Document',
        data: snap.data(),
      });

      //logger.log({ fn: 'testFirestoreStartup', message: 'Created document', data: snap.data() });
      await database.collection(testCollection).doc(documentId).delete();

      lpLogger.log({
        fn: 'testFirestoreStartup',
        message: 'Deleted document',
        docId: documentId,
      });
    } catch (error) {
      logger.error({ fn: 'testFirestoreStartup', error });
      throw new Error('Firestore startup self-test failed');
    }
  }

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      hsts: process.env.NODE_ENV === 'production',
    }),
  );

  app.use(compression());

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapterHost));

  // Global validation pipe
  app.useGlobalPipes(new CustomValidationPipe());

  // Global interceptors
  app.useGlobalInterceptors(
    new TracingInterceptor(),
    new TimeoutInterceptor(new Reflector()),
  );

  // Body parsing with size limits
  const maxFileSize =
    configService.get<number>('MAX_FILE_SIZE') || 10 * 1024 * 1024;

  app.use(bodyParser.json({ limit: maxFileSize }));
  app.use(bodyParser.urlencoded({ limit: maxFileSize, extended: true }));

  // Cookie parsing
  app.use(cookieParser(process.env.COOKIE_SECRET));

  await testFirestoreStartup();

  // CORS configuration
  app.enableCors(environmentService.getCorsConfig());

  // Swagger documentation (only in development)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Simulation API')
      .setDescription('LivePerson Conversation Simulator API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api-docs', app, document);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;


  // Graceful shutdown handling
  const server = await app.listen(port);

  // Handle shutdown signals
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully');
    await shutdownService.gracefulShutdown(server);
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully');
    await shutdownService.gracefulShutdown(server);
    process.exit(0);
  });

  printStartUp(port);

  // Log configuration summary in development
  if (!environmentService.isProduction()) {
    logger.debug(
      'Configuration Summary:',
      environmentService.getConfigSummary(),
    );
  }
}

bootstrap();
