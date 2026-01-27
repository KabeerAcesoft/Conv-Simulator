import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const API_VERSION_KEY = 'apiVersion';

export const API_DEPRECATION_KEY = 'apiDeprecation';

export interface ApiVersionOptions {
  version: string;
  deprecated?: boolean;
  deprecationDate?: string;
  migrationGuide?: string;
  sunset?: string; // When the API version will be removed
}

/**
 * Decorator to mark API endpoints with version information
 */
export function ApiVersion(options: ApiVersionOptions) {
  const decorators = [
    SetMetadata(API_VERSION_KEY, options),
    ApiHeader({
      name: 'Accept-Version',
      required: false,
      description: `API version. Current: ${options.version}`,
      example: options.version,
    }),
  ];

  if (options.deprecated) {
    decorators.push(
      SetMetadata(API_DEPRECATION_KEY, {
        deprecated: true,
        deprecationDate: options.deprecationDate,
        migrationGuide: options.migrationGuide,
        sunset: options.sunset,
      }),
      SetMetadata('deprecated-api-operation', {
        deprecated: true,
        description: `⚠️ DEPRECATED: This API version is deprecated. ${
          options.sunset ? `Will be removed on ${options.sunset}.` : ''
        } ${options.migrationGuide ? 'Migration guide: ' + options.migrationGuide : ''}`,
      }),
    );
  }

  return applyDecorators(...decorators);
}

/**
 * Current API version decorator
 */
export const ApiVersionCurrent = (version = '1.0') => ApiVersion({ version });

/**
 * Deprecated API version decorator
 */
export const ApiVersionDeprecated = (
  version: string,
  sunset?: string,
  migrationGuide?: string,
) =>
  ApiVersion({
    version,
    deprecated: true,
    deprecationDate: new Date().toISOString(),
    sunset,
    migrationGuide,
  });

/**
 * Beta API version decorator
 */
export const ApiVersionBeta = (version: string) =>
  ApiVersion({
    version: `${version}-beta`,
    deprecated: false,
  });
