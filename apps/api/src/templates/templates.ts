import { TEMPLATE_IDS } from 'contracts';
import type { Template } from 'contracts';

/**
 * The profile templates, served by GET /api/templates. Every word must compile in the
 * extension (`compileRule` in src/lib/words.js); templates.spec.ts asserts it. `calm-adult`
 * mirrors browser/hush/managed-storage.json plus the Politics pack.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'young-kid',
    name: 'Young kid',
    description: 'Locked. Celebrity and search spam packs, clickbait words, no Shorts or live streams, YouTube opens on subscriptions.',
    locked: true,
    rules: {
      blockWords: ['giveaway', 'sponsored', 'clickbait', 'prank', 'challenge'],
      enabledPacks: ['Celebrity', 'Search Spam'],
      siteWords: { YouTube: ['#shorts', 'reaction', '=live'], Reddit: ['r/popular', 'r/all'] },
      siteOptions: { ytHomeRedirect: true },
      quietHours: null,
    },
  },
  {
    id: 'teen',
    name: 'Teen',
    description: 'Locked. Crypto, celebrity and search spam packs, gambling and clickbait words, no Shorts.',
    locked: true,
    rules: {
      blockWords: ['giveaway', 'sponsored', 'clickbait', 'casino', 'betting', '=bet'],
      enabledPacks: ['Crypto', 'Celebrity', 'Search Spam'],
      siteWords: { YouTube: ['#shorts'] },
      siteOptions: {},
      quietHours: null,
    },
  },
  {
    id: 'calm-adult',
    name: 'Calm adult',
    description: 'Not locked. The household defaults plus the Politics pack.',
    locked: false,
    rules: {
      blockWords: ['giveaway', 'sponsored', '=ai', 'clickbait'],
      enabledPacks: ['Search Spam', 'Politics'],
      siteWords: {
        Reddit: ['r/popular', 'AMA'],
        X: ['trending'],
        YouTube: ['#shorts', 'reaction'],
        Google: ['pinterest'],
      },
      siteOptions: { ytHomeRedirect: true },
      quietHours: null,
    },
  },
];

if (TEMPLATES.map((t) => t.id).join() !== TEMPLATE_IDS.join()) {
  throw new Error('TEMPLATES must list every TEMPLATE_IDS entry, in order');
}
