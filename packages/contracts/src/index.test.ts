import { describe, expect, it } from 'vitest';
import { HealthResponse } from './index.js';

describe('HealthResponse', () => {
  it('accepts the health payload', () => {
    expect(HealthResponse.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects anything else', () => {
    expect(HealthResponse.safeParse({ status: 'down' }).success).toBe(false);
  });
});
