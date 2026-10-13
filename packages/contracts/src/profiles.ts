import { z } from 'zod';
import { CAPS, Name, Word } from './common.js';
import { SiteOptions, SiteWords } from './sites.js';
import { QuietHours } from './schedule.js';

export const RuleSet = z.object({
  blockWords: z.array(Word).max(CAPS.maxWords),
  enabledPacks: z.array(Name).max(CAPS.maxPacks),
  siteWords: SiteWords,
  siteOptions: SiteOptions,
  quietHours: QuietHours.nullable(),
});
export type RuleSet = z.infer<typeof RuleSet>;

export const TEMPLATE_IDS = ['young-kid', 'teen', 'calm-adult'] as const;
export const TemplateId = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof TemplateId>;

export const Profile = z.object({
  id: z.uuid(),
  name: Name,
  locked: z.boolean(),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileWithRules = Profile.extend({ rules: RuleSet });
export type ProfileWithRules = z.infer<typeof ProfileWithRules>;

export const ProfileCreate = z.object({
  name: Name,
  templateId: TemplateId.optional(),
  locked: z.boolean().optional(),
});
export type ProfileCreate = z.infer<typeof ProfileCreate>;

export const ProfilePatch = z.object({ name: Name.optional(), locked: z.boolean().optional() });
export type ProfilePatch = z.infer<typeof ProfilePatch>;

/** Body of PUT /api/profiles/:id/rules. `If-Match` carries the version; stale → 412 `stale_version`. */
export const RuleSetPut = RuleSet;
export type RuleSetPut = RuleSet;

export const Template = z.object({
  id: TemplateId,
  name: Name,
  description: z.string(),
  locked: z.boolean(),
  rules: RuleSet,
});
export type Template = z.infer<typeof Template>;
