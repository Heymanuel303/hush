import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodPipe } from './zod.pipe.js';

const pipe = new ZodPipe(z.object({ n: z.number() }));

describe('ZodPipe', () => {
  it('returns parsed data', () => {
    expect(pipe.transform({ n: 1, extra: 2 })).toEqual({ n: 1 });
  });

  it('throws a 400 with the ErrorBody shape and the issues', () => {
    try {
      pipe.transform({ n: 'x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const ex = e as BadRequestException;
      expect(ex.getStatus()).toBe(400);
      const body = ex.getResponse() as { error: string; message: string; details: { path: unknown[] }[] };
      expect(body.error).toBe('validation');
      expect(typeof body.message).toBe('string');
      expect(body.details[0].path).toEqual(['n']);
    }
  });

  it('rejects undefined bodies', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
