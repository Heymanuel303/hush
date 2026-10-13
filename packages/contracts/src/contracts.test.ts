import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PACKS,
  CAPS,
  DeviceConfig,
  PairRequest,
  PairResponse,
  PairingCode,
  QuietHours,
  ROUTES,
  SITE_IDS,
  SITE_OPTION_KEYS,
  Word,
  Device,
  DevicePatch,
  PiholeConnectionPut,
  RuleSet,
  SiteWords,
} from './index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const req = createRequire(import.meta.url);
const fixtures = `${root}test/fixtures/device-config/`;
const load = (n: string) => JSON.parse(readFileSync(fixtures + n, 'utf8'));
const { PACKS } = req('../../../src/data/packs.js');
const { SITES } = req('../../../src/data/sites.js');
const { compileRule } = req('../../../src/lib/words.js');

describe('DeviceConfig fixtures', () => {
  it.each(['valid-minimal.json', 'valid-full.json'])('%s parses', (f) => {
    expect(DeviceConfig.safeParse(load(f)).success).toBe(true);
  });

  it.each([
    ['invalid-too-many-words.json', ['blockWords']],
    ['invalid-empty-word.json', ['blockWords', 1]],
    ['invalid-unknown-site.json', ['siteWords']],
    ['invalid-bad-window.json', ['quietHours', 'windows', 0]],
    ['invalid-bad-timezone.json', ['quietHours', 'timezone']],
    ['invalid-equal-window.json', ['quietHours', 'windows', 0]],
  ])('%s fails at the expected path', (f, prefix) => {
    const r = DeviceConfig.safeParse(load(f));
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.slice(0, prefix.length));
    expect(paths).toContainEqual(prefix);
  });

  it('every invalid fixture on disk is covered above', () => {
    expect(readdirSync(fixtures).filter((f) => f.startsWith('invalid-')).length).toBe(6);
  });
});

describe('guards against the extension', () => {
  it('CAPS equals caps.json', () => expect(CAPS).toEqual(load('caps.json')));
  it('BUILT_IN_PACKS equals src/data/packs.js', () => expect(BUILT_IN_PACKS).toEqual(PACKS));
  it('SITE_IDS equals src/data/sites.js', () =>
    expect([...SITE_IDS]).toEqual(SITES.map((s: { id: string }) => s.id)));
  it('SITE_OPTION_KEYS equals the keys in panel-sites.js', () => {
    const src = readFileSync(`${root}src/popup/panel-sites.js`, 'utf8');
    const keys = [...src.matchAll(/key:\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
    expect([...SITE_OPTION_KEYS]).toEqual(keys);
  });
});

describe('Word vs compileRule', () => {
  it('compiles every fixture and built-in word', () => {
    const words = [
      ...BUILT_IN_PACKS.flatMap((p) => p.words),
      ...['valid-minimal.json', 'valid-full.json'].flatMap((f) => {
        const c = load(f);
        return [
          ...c.blockWords,
          ...c.packs.flatMap((p: { words: string[] }) => p.words),
          ...Object.values<string[]>(c.siteWords).flat(),
        ];
      }),
    ];
    expect(words.length).toBeGreaterThan(10);
    for (const w of words) expect(compileRule(w), w).not.toBeNull();
  });

  it.each(['', ' ', '=', '= ', '=a', 'a'.repeat(64), 'a'.repeat(65), '  cat  '])(
    'Word accepting %j implies compileRule is non-null',
    (s) => {
      if (Word.safeParse(s).success) expect(compileRule(s)).not.toBeNull();
    },
  );

  it('rejects a bare = with the documented message', () => {
    const r = Word.safeParse('=');
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe('a word needs at least one character besides =');
  });

  it('trims and enforces the 64 cap', () => {
    expect(Word.parse('  cat  ')).toBe('cat');
    expect(Word.safeParse('a'.repeat(64)).success).toBe(true);
    expect(Word.safeParse('a'.repeat(65)).success).toBe(false);
  });
});

describe('schemas', () => {
  const rules = {
    blockWords: [],
    enabledPacks: [],
    siteWords: {},
    siteOptions: {},
    quietHours: null,
  };
  it('RuleSet caps', () => {
    expect(RuleSet.safeParse(rules).success).toBe(true);
    expect(RuleSet.safeParse({ ...rules, enabledPacks: Array(51).fill('a') }).success).toBe(false);
    expect(RuleSet.safeParse({ ...rules, siteOptions: { nope: true } }).success).toBe(false);
    expect(RuleSet.safeParse({ ...rules, quietHours: undefined }).success).toBe(false);
  });
  it('SiteWords is partial and capped', () => {
    expect(SiteWords.safeParse({ X: ['a'] }).success).toBe(true);
    expect(SiteWords.safeParse({ X: Array(201).fill('a') }).success).toBe(false);
  });
  it('QuietHours windows', () => {
    const w = { days: [0], start: '00:00', end: '23:59' };
    expect(QuietHours.safeParse({ timezone: 'UTC', windows: [w] }).success).toBe(true);
    expect(QuietHours.safeParse({ timezone: 'UTC', windows: [] }).success).toBe(false);
    expect(QuietHours.safeParse({ timezone: 'UTC', windows: Array(15).fill(w) }).success).toBe(
      false,
    );
    expect(QuietHours.safeParse({ timezone: 'UTC', windows: [{ ...w, days: [] }] }).success).toBe(
      false,
    );
    expect(
      QuietHours.safeParse({ timezone: 'UTC', windows: [{ ...w, end: '24:00' }] }).success,
    ).toBe(false);
  });
  it('pairing code alphabet', () => {
    const base = { profileId: crypto.randomUUID(), expiresAt: '2026-10-13T10:00:00Z' };
    expect(PairingCode.safeParse({ ...base, code: 'ABCDEF' }).success).toBe(true);
    for (const bad of ['ABCDE0', 'ABCDEO', 'ABCDE1', 'ABCDEI', 'ABCDE', 'abcdef', 'ABCDEFG'])
      expect(PairRequest.shape.code.safeParse(bad).success, bad).toBe(false);
  });
  it('PairResponse token is 43 base64url characters', () => {
    const ok = { deviceId: crypto.randomUUID(), profileName: 'p', hubName: 'h' };
    expect(PairResponse.safeParse({ ...ok, token: 'a'.repeat(43) }).success).toBe(true);
    expect(PairResponse.safeParse({ ...ok, token: 'a'.repeat(44) }).success).toBe(false);
    expect(PairResponse.safeParse({ ...ok, token: 'a'.repeat(42) + '+' }).success).toBe(false);
  });
  it('device tailscaleIp accepts v4/v6/null', () => {
    for (const ip of ['100.64.0.1', 'fd7a:115c:a1e0::1', null])
      expect(DevicePatch.safeParse({ tailscaleIp: ip }).success).toBe(true);
    expect(DevicePatch.safeParse({ tailscaleIp: '999.1.1.1' }).success).toBe(false);
    expect(Device.shape.kidMode).toBeDefined();
  });
  it('pihole url must be http(s) and <= 200', () => {
    const p = { kidGroupName: 'Kid' };
    expect(PiholeConnectionPut.safeParse({ ...p, url: 'http://192.168.1.11' }).success).toBe(true);
    expect(PiholeConnectionPut.safeParse({ ...p, url: 'https://pi.hole' }).success).toBe(true);
    expect(PiholeConnectionPut.safeParse({ ...p, url: 'ftp://pi.hole' }).success).toBe(false);
    expect(
      PiholeConnectionPut.safeParse({ ...p, url: 'http://a.io/' + 'x'.repeat(200) }).success,
    ).toBe(false);
    expect(
      PiholeConnectionPut.safeParse({ ...p, url: 'http://a.io', appPassword: '' }).success,
    ).toBe(false);
  });
});

describe('routes', () => {
  it('has no stats or telemetry route', () => {
    for (const r of Object.values(ROUTES)) expect(r.path).not.toMatch(/stats|telemetry|metrics/);
    // summary is Pi-hole data, not device data
    expect(
      Object.values(ROUTES)
        .filter((r) => r.auth !== 'admin')
        .map((r) => r.path)
        .sort(),
    ).toEqual(
      ['/api/device/config', '/api/auth/login', '/api/devices/pair', '/api/setup/status'].sort(),
    );
  });
  it('method+path pairs are unique', () => {
    const keys = Object.values(ROUTES).map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// Independent reference evaluator: proves the shared schedule cases are self-consistent
// (the extension's schedule.js and the API worker's twin run the same file).
describe('schedule cases', () => {
  const cases: { name: string; quietHours: QuietHours | null; now: string; expected: boolean }[] =
    JSON.parse(readFileSync(`${root}test/fixtures/schedule/cases.json`, 'utf8'));
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const active = (q: QuietHours | null, now: string) => {
    if (!q) return false;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: q.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(now))
        .map((p) => [p.type, p.value]),
    );
    const day = DAYS.indexOf(parts.weekday);
    const min = Number(parts.hour) * 60 + Number(parts.minute);
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return q.windows.some((w) => {
      const s = mins(w.start),
        e = mins(w.end);
      if (s < e) return w.days.includes(day) && min >= s && min < e;
      return (w.days.includes(day) && min >= s) || (w.days.includes((day + 6) % 7) && min < e);
    });
  };
  it('has at least twelve cases that all validate', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    for (const c of cases)
      if (c.quietHours) expect(QuietHours.safeParse(c.quietHours).success, c.name).toBe(true);
  });
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_n, c) => {
    expect(active(c.quietHours, c.now)).toBe(c.expected);
  });
});
