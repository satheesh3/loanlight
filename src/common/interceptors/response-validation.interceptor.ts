import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable()
export class ResponseValidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseValidationInterceptor.name);

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      switchMap(async (data: unknown) => {
        if (!data || typeof data !== 'object') return data;

        const targets = Array.isArray(data) ? data : [data];

        for (const target of targets) {
          if (!target || typeof target !== 'object') continue;

          const errors = await validate(target as object, {
            skipMissingProperties: false,
            whitelist: true,
          });

          if (errors.length > 0) {
            this.logger.error(
              `Response validation failed: ${JSON.stringify(errors.map((e) => ({ property: e.property, constraints: e.constraints })))}`,
            );
            if (process.env.NODE_ENV !== 'production') {
              throw new InternalServerErrorException({
                message: 'Response validation failed',
                errors: errors.map((e) => ({
                  property: e.property,
                  constraints: e.constraints,
                })),
              });
            }
          }
        }

        return data;
      }),
    );
  }
}
