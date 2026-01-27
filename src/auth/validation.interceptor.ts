import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import {
  ClassTransformOptions,
  instanceToPlain,
  plainToInstance,
} from 'class-transformer';
import { validate, ValidatorOptions } from 'class-validator';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable()
export class ResponseValidationInterceptor<T extends object>
  implements NestInterceptor<any, T>
{
  private readonly options: {
    transform?: ClassTransformOptions;
    validate?: ValidatorOptions;
  } = {};
  constructor(
    private readonly dto: new () => T,
    options?: {
      transform?: ClassTransformOptions;
      validate?: ValidatorOptions;
    },
  ) {
    this.options = options;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<T> {
    return next.handle().pipe(
      switchMap(async (data) => {
        if (data === null) {
          return null;
        }

        const transformedData = plainToInstance(
          this.dto,
          data,
          this.options?.transform || {
            enableImplicitConversion: true,
            excludeExtraneousValues: true,
          },
        );

        const errors = await validate(
          transformedData,
          this.options?.validate || {
            whitelist: true,
            forbidNonWhitelisted: false,
            skipMissingProperties: true,
            skipUndefinedProperties: true,
          },
        );

        if (process.env.NODE_ENV === 'development') {
          console.info('errors', errors);
        }

        if (errors.length > 0) {
          const logValidationErrors = (errs: any[], path = '') => {
            for (const error of errs) {
              const propertyPath = path
                ? `${path}.${error.property}`
                : error.property;

              if (error.constraints && process.env.NODE_ENV === 'development') {
                console.error(
                  `Validation error at "${propertyPath}":`,
                  error.constraints,
                );
              }

              if (error.children && error.children.length > 0) {
                logValidationErrors(error.children, propertyPath);
              }

              // Special case: array of nested classes
              if (
                Array.isArray(error.value) &&
                error.children &&
                error.children.length > 0
              ) {
                error.children.forEach((child: any, index: number) => {
                  if (
                    child.constraints ||
                    (child.children && child.children.length > 0)
                  ) {
                    logValidationErrors([child], `${propertyPath}[${index}]`);
                  }
                });
              }
            }
          };

          logValidationErrors(errors);
        }

        return instanceToPlain(transformedData) as T;
      }),
    );
  }
}
