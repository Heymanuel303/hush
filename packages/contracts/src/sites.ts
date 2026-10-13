import { z } from 'zod';
import { CAPS, Word } from './common.js';

/** Mirrors `SITES` in src/data/sites.js (pinned by a test). */
export const SITE_IDS = ['Reddit', 'X', 'YouTube', 'Google'] as const;
export const SiteId = z.enum(SITE_IDS);
export type SiteId = z.infer<typeof SiteId>;

/** Mirrors `SITE_OPTIONS` keys in src/popup/panel-sites.js (pinned by a test). */
export const SITE_OPTION_KEYS = ['ytHomeRedirect'] as const;
export const SiteOptions = z.object({ ytHomeRedirect: z.boolean().optional() }).strict();
export type SiteOptions = z.infer<typeof SiteOptions>;

/** Partial record: sites without words may be missing. */
export const SiteWords = z.partialRecord(SiteId, z.array(Word).max(CAPS.maxSiteWords));
export type SiteWords = z.infer<typeof SiteWords>;
