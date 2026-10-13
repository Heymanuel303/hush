import { z } from 'zod';
import { Name } from './common.js';

const Instant = z.iso.datetime({ offset: true });
const HttpUrl = z
  .url({ protocol: /^https?$/ })
  .max(200);

export const PiholeConnection = z.object({
  url: HttpUrl,
  kidGroupName: Name.default('Kid'),
  hasSecret: z.boolean(),
  lastCheckedAt: Instant.nullable().optional(),
  lastError: z.string().nullable().optional(),
});
export type PiholeConnection = z.infer<typeof PiholeConnection>;

/** `appPassword` omitted = keep the stored one. */
export const PiholeConnectionPut = z.object({
  url: HttpUrl,
  appPassword: z.string().min(1).max(256).optional(),
  kidGroupName: Name,
});
export type PiholeConnectionPut = z.infer<typeof PiholeConnectionPut>;

export const PiholeTestResult = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  groups: z.array(z.object({ id: z.number().int(), name: z.string() })).optional(),
  error: z.string().optional(),
});
export type PiholeTestResult = z.infer<typeof PiholeTestResult>;

export const PiholeSummary = z.object({
  queries: z.object({
    total: z.number(),
    blocked: z.number(),
    percentBlocked: z.number(),
  }),
  topClients: z.array(
    z.object({ ip: z.string(), name: z.string().nullable(), blocked: z.number() }),
  ),
});
export type PiholeSummary = z.infer<typeof PiholeSummary>;
