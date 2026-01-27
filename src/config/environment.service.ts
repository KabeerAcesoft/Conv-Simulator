import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvironmentService {
  private readonly logger = new Logger(EnvironmentService.name);
  private readonly secrets = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {
    this.validateConfiguration();
    this.loadSecrets();
  }

  /**
   * Get configuration value with type safety
   */
  get<T = string>(key: string, defaultValue?: T): T {
    return this.configService.get<T>(key, defaultValue);
  }

  /**
   * Get secret value (encrypted/masked in logs)
   */
  getSecret(key: string): string | undefined {
    return this.secrets.get(key) || this.configService.get<string>(key);
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    const serviceAccount = JSON.parse(this.get('FIREBASE_SERVICE_ACCOUNT'));

    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      credentials: serviceAccount,
      timeout: this.get('DATABASE_TIMEOUT', 10000),
    };
  }

  /**
   * Get cache configuration
   */
  getCacheConfig() {
    return {
      url: this.getSecret('REDIS_URL'),
      ttl: this.get('CACHE_TTL', 3600),
      timeout: this.get('CACHE_TIMEOUT', 5000),
    };
  }

  /**
   * Get security configuration
   */
  getSecurityConfig() {
    return {
      jwtSecret: this.getSecret('JWT_SECRET'),
      jwtExpiresIn: this.get('JWT_EXPIRES_IN', '24h'),
      cookieSecret: this.getSecret('COOKIE_SECRET'),
      rateLimitTtl: this.get('RATE_LIMIT_TTL', 60000),
      rateLimitMax: this.get('RATE_LIMIT_MAX', 100),
    };
  }

  /**
   * Get application limits
   */
  getApplicationLimits() {
    return {
      maxConcurrentConversations: this.get('MAX_CONCURRENT_CONVERSATIONS', 10),
      maxConversationDuration: this.get('MAX_CONVERSATION_DURATION', 3600000),
      maxFileSize: this.get('MAX_FILE_SIZE', 10485760),
      httpTimeout: this.get('HTTP_TIMEOUT', 30000),
    };
  }

  /**
   * Get external API configuration
   */
  getExternalApisConfig() {
    return {
      openai: {
        apiKey: this.getSecret('OPENAI_API_KEY'),
      },
      liveperson: {
        appKey: this.getSecret('LIVEPERSON_APP_KEY'),
        appSecret: this.getSecret('LIVEPERSON_APP_SECRET'),
      },
    };
  }

  /**
   * Get CORS configuration
   */
  getCorsConfig() {
    const allowedOrigins = this.get('ALLOWED_ORIGINS');

    return {
      origin:
        this.isProduction() && allowedOrigins
          ? allowedOrigins.split(',')
          : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'Accept-Version',
      ],
    };
  }

  /**
   * Validate required configuration
   */
  private validateConfiguration(): void {
    const requiredKeys = [
      'FIREBASE_PROJECT_ID',
      // 'FIREBASE_SERVICE_ACCOUNT',
      // 'REDIS_URL',
      // 'JWT_SECRET',
      // 'OPENAI_API_KEY',
    ];

    const missingKeys = requiredKeys.filter(
      (key) => !this.configService.get(key),
    );

    if (missingKeys.length > 0) {
      this.logger.error(
        `Missing required configuration: ${missingKeys.join(', ')}`,
      );

      throw new Error(
        `Configuration validation failed. Missing: ${missingKeys.join(', ')}`,
      );
    }

    // Validate JWT secret strength
    const jwtSecret = this.configService.get('JWT_SECRET');

    if (jwtSecret && jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }

    this.logger.log('Configuration validation passed');
  }

  /**
   * Load secrets (in production, this would integrate with secret management)
   */
  private loadSecrets(): void {
    // In production, you would integrate with:
    // - AWS Secrets Manager
    // - Azure Key Vault
    // - HashiCorp Vault
    // - Kubernetes Secrets

    const secretKeys = [
      'JWT_SECRET',
      'COOKIE_SECRET',
      'REDIS_URL',
      'OPENAI_API_KEY',
      'LIVEPERSON_APP_KEY',
      'LIVEPERSON_APP_SECRET',
    ];

    secretKeys.forEach((key) => {
      const value = this.configService.get(key);

      if (value) {
        this.secrets.set(key, value);
      }
    });

    this.logger.log(`Loaded ${this.secrets.size} secrets from configuration`);
  }

  /**
   * Get configuration summary for debugging (secrets masked)
   */
  getConfigSummary(): Record<string, any> {
    const config = {
      environment: this.get('NODE_ENV'),
      port: this.get('PORT'),
      database: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        serviceAccount: this.maskSecret(this.get('FIREBASE_SERVICE_ACCOUNT')),
      },
      cache: {
        url: this.maskSecret(this.get('REDIS_URL', '')),
        ttl: this.get('CACHE_TTL'),
      },
      security: {
        jwtSecret: this.maskSecret(this.getSecret('JWT_SECRET') || ''),
        jwtExpiresIn: this.get('JWT_EXPIRES_IN'),
      },
      limits: this.getApplicationLimits(),
      external: {
        openai: {
          apiKey: this.maskSecret(this.getSecret('OPENAI_API_KEY') || ''),
        },
        liveperson: {
          appKey: this.maskSecret(this.getSecret('LIVEPERSON_APP_KEY') || ''),
          appSecret: this.maskSecret(
            this.getSecret('LIVEPERSON_APP_SECRET') || '',
          ),
        },
      },
    };

    return config;
  }

  private maskSecret(secret: string): string {
    if (!secret || secret.length < 8) return '[REDACTED]';

    return secret.substring(0, 4) + '***' + secret.substring(secret.length - 4);
  }
}
