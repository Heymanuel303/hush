import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BUILT_IN_PACKS, RuleSet, SITE_IDS, TEMPLATE_IDS, Template } from 'contracts';
import { TEMPLATES } from '../src/templates/templates.js';

// The extension is plain CommonJS outside the workspace; load it the way its own tests do.
const require = createRequire(import.meta.url);
const { compileRule } = require(fileURLToPath(new URL('../../../src/lib/words.js', import.meta.url))) as {
  compileRule: (w: string) => unknown;
};

describe('templates', () => {
  it('lists every template id once, in order', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
  });

  it.each(TEMPLATES)('$id matches the contract', (t) => {
    expect(Template.safeParse(t).success).toBe(true);
    expect(RuleSet.safeParse(t.rules).success).toBe(true);
  });

  it.each(TEMPLATES)('$id: every word compiles in the extension', (t) => {
    const words = [...t.rules.blockWords, ...Object.values(t.rules.siteWords).flat()];
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(compileRule(w), w).not.toBeNull();
  });

  it.each(TEMPLATES)('$id: packs and sites exist', (t) => {
    const builtIn = BUILT_IN_PACKS.map((p) => p.name);
    for (const p of t.rules.enabledPacks) expect(builtIn).toContain(p);
    for (const s of Object.keys(t.rules.siteWords)) expect(SITE_IDS as readonly string[]).toContain(s);
  });

  it('has no duplicate words inside a list', () => {
    for (const t of TEMPLATES) {
      const lists = [t.rules.blockWords, ...Object.values(t.rules.siteWords)];
      for (const l of lists) expect(new Set(l!.map((w) => w.toLowerCase())).size).toBe(l!.length);
    }
  });

  it('young-kid and teen are locked, calm-adult is not', () => {
    const lock = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.locked]));
    expect(lock).toEqual({ 'young-kid': true, teen: true, 'calm-adult': false });
  });
});
