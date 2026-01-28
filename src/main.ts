import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

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
import { printStartUp } from './utils/common';
import { AppModule } from './app.module';

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

  // 🛡 Security
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      hsts: process.env.NODE_ENV === 'production',
    }),
  );

  app.use(compression());

  // 🌍 Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapterHost));

  // ✅ Validation
  app.useGlobalPipes(new CustomValidationPipe());

  // 🔍 Interceptors
  app.useGlobalInterceptors(
    new TracingInterceptor(),
    new TimeoutInterceptor(new Reflector()),
  );

  // 📦 Body parsing
  const maxFileSize =
    configService.get<number>('MAX_FILE_SIZE') || 10 * 1024 * 1024;

  app.use(bodyParser.json({ limit: maxFileSize }));
  app.use(bodyParser.urlencoded({ limit: maxFileSize, extended: true }));

  // 🍪 Cookies
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // 🌐 CORS
  app.enableCors(environmentService.getCorsConfig());

  // 📚 Swagger (dev only)
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

  // 🔥 Cloud Run port binding
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  const server = await app.listen(port, '0.0.0.0');

  console.log('✅ SERVER STARTED ON PORT:', port);
  printStartUp(port);

  // 🛑 Graceful shutdown
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

  if (!environmentService.isProduction()) {
    logger.debug(
      'Configuration Summary:',
      environmentService.getConfigSummary(),
    );
  }
}

bootstrap().catch((err) => {
  console.error('🔥 APP CRASHED DURING STARTUP:', err);
  process.exit(1);
});
