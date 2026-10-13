import { z } from 'zod';

// Shared Zod schemas and inferred types for api and web: one file per area, re-exported here.
// Contracts are shape and length caps only; the `=` whole-word prefix lives in src/lib/words.js.

export const HealthResponse = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponse>;

export * from './common.js';
export * from './sites.js';
export * from './packs.js';
export * from './schedule.js';
export * from './profiles.js';
export * from './devices.js';
export * from './device-config.js';
export * from './pihole.js';
export * from './auth.js';
export * from './routes.js';
