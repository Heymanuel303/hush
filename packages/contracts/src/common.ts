import { z } from 'zod';

/** Body of every non-2xx response. `error` is a machine code (kebab or snake case). */
export const ErrorBody = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

/** Size caps shared by contracts, API and the extension's validator (pinned by caps.json). */
export const CAPS = {
  maxWords: 500,
  maxWordLength: 64,
  maxSiteWords: 200,
  maxPacks: 50,
  maxPackWords: 200,
  maxNameLength: 40,
  maxWindows: 14,
} as const;

/**
 * A word is an opaque string: trimmed, 1..64 characters. The `=` whole-word prefix is
 * interpreted only in `src/lib/words.js`. The single exception is the refine below: a bare
 * `=` (or `= `) compiles to no rule in the extension, so the contract rejects it without
 * otherwise interpreting the prefix.
 */
export const Word = z
  .string()
  .trim()
  .min(1)
  .max(CAPS.maxWordLength)
  .refine((w) => w.slice(w.startsWith('=') ? 1 : 0).trim().length > 0, {
    message: 'a word needs at least one character besides =',
  });
export type Word = z.infer<typeof Word>;

export const Name = z.string().trim().min(1).max(CAPS.maxNameLength);
