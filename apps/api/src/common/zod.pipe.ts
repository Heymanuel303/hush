import { BadRequestException, Body, Injectable, Query } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ErrorBody } from 'contracts';
import type { ZodType } from 'zod';

/** Parses with a Zod schema; a failure is a 400 with the ErrorBody shape (`error: 'validation'`). */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const body: ErrorBody = {
      error: 'validation',
      message: 'The request did not match the expected shape.',
      details: result.error.issues,
    };
    throw new BadRequestException(body);
  }
}

/** `@ZodBody(Schema) body: T` */
export const ZodBody = (schema: ZodType) => Body(new ZodPipe(schema));

/** `@ZodQuery(Schema) query: T` */
export const ZodQuery = (schema: ZodType) => Query(new ZodPipe(schema));
