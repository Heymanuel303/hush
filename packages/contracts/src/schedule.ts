import { z } from 'zod';
import { CAPS } from './common.js';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

export const QuietWindow = z.object({
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .refine((d) => new Set(d).size === d.length, { message: 'days must be unique' }),
  start: Time,
  end: Time,
});
export type QuietWindow = z.infer<typeof QuietWindow>;

/**
 * Hub rules apply **inside** the windows; `null` or absent means always. `days` are 0..6
 * (0 = Sunday) in `timezone`, an IANA name. A window whose `end` is before `start` crosses
 * midnight. Start is inclusive, end exclusive.
 */
export const QuietHours = z.object({
  timezone: z.string().min(1).max(64),
  windows: z.array(QuietWindow).min(1).max(CAPS.maxWindows),
});
export type QuietHours = z.infer<typeof QuietHours>;
