import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  Logger,
  PipeTransform,
} from '@nestjs/common';

import { sanitize } from 'class-sanitizer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform {
  private readonly logger = new Logger(ValidationPipe.name);

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Transform plain object to class instance
    const object = plainToInstance(metatype, value);

    // Sanitize the object to remove potentially harmful content
    sanitize(object);

    // Validate the object
    const errors = await validate(object, {
      whitelist: true, // Remove non-whitelisted properties
      forbidNonWhitelisted: false, // Allow additional properties (don't throw error)
      transform: true, // Transform values to expected types
      validateCustomDecorators: true, // Validate custom decorators
    });

    if (errors.length > 0) {
      const errorMessage = errors
        .map((error) => {
          const constraints = error.constraints || {};

          return Object.values(constraints).join(', ');
        })
        .join('; ');

      this.logger.warn({
        message: 'Validation failed',
        errors: errorMessage,
        input: JSON.stringify(value),
      });

      throw new BadRequestException({
        message: 'Validation failed',
        errors: errorMessage,
        statusCode: 400,
      });
    }

    return object;
  }

  private toValidate(metatype: new (...arguments_: any[]) => any): boolean {
    const types: (new (...arguments_: any[]) => any)[] = [
      String,
      Boolean,
      Number,
      Array,
      Object,
    ];

    return !types.includes(metatype);
  }
}
