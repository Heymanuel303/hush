import { z } from 'zod';
import { CAPS, Name, Word } from './common.js';
import { SiteOptions, SiteWords } from './sites.js';
import { QuietHours } from './schedule.js';

/**
 * Body of GET /api/device/config: 200 with `ETag: "<profileId>:<version>"`, 304 on a matching
 * `If-None-Match`, 401 `revoked` for a revoked or unknown token. `packs` holds only the
 * enabled packs (built-in or household) with their words.
 */
export const DeviceConfig = z.object({
  version: z.number().int(),
  profileName: Name,
  locked: z.boolean(),
  blockWords: z.array(Word).max(CAPS.maxWords),
  enabledPacks: z.array(Name).max(CAPS.maxPacks),
  packs: z
    .array(z.object({ name: Name, words: z.array(Word).max(CAPS.maxPackWords) }))
    .max(CAPS.maxPacks),
  siteWords: SiteWords,
  siteOptions: SiteOptions,
  quietHours: QuietHours.nullable(),
});
export type DeviceConfig = z.infer<typeof DeviceConfig>;
