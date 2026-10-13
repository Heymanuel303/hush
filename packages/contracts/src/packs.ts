import { z } from 'zod';
import { CAPS, Name, Word } from './common.js';

/** Mirrors `PACKS` in src/data/packs.js (pinned by a test). */
export const BUILT_IN_PACKS: ReadonlyArray<{ name: string; words: readonly string[] }> = [
  { name: 'Spoilers', words: ['spoiler', 'spoilers', 'leaked', '=ending', 'plot twist'] },
  { name: 'Politics', words: ['election', 'politics', 'congress', '=senate', 'president'] },
  { name: 'Crypto', words: ['crypto', 'bitcoin', 'ethereum', '=nft', 'altcoin'] },
  { name: 'Sports', words: ['=nfl', '=nba', 'playoffs', 'world cup', 'premier league'] },
  { name: 'Celebrity', words: ['kardashian', 'celebrity gossip', 'red carpet'] },
  { name: 'Search Spam', words: ['pinterest', 'quora', 'fandom', 'ehow', 'ask.com'] },
];

const PackWords = z.array(Word).min(1).max(CAPS.maxPackWords);

export const Pack = z.object({
  id: z.uuid(),
  name: Name,
  words: PackWords,
  builtIn: z.boolean(),
});
export type Pack = z.infer<typeof Pack>;

export const PackCreate = z.object({ name: Name, words: PackWords });
export type PackCreate = z.infer<typeof PackCreate>;

export const PackUpdate = z.object({ name: Name.optional(), words: PackWords.optional() });
export type PackUpdate = z.infer<typeof PackUpdate>;
