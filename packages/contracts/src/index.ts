import { z } from 'zod';

// Shared Zod schemas and inferred types for api and web. Feature schemas land here (one file
// per area, re-exported from this index); the contracts ticket adds DeviceConfig and the rest.

export const HealthResponse = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponse>;
