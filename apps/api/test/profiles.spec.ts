import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { ProfileWithRules } from 'contracts';
import type { OidcStub } from '@heymanuel303/idp-client/testkit';
import request from 'supertest';
import { TEMPLATES } from '../src/templates/templates.js';
import { createTestApp, prismaOf, resetDb } from './db.js';
import { adminCookie, ssoEnv, startStub } from './sso.js';

const saved = { ...process.env };
let stub: OidcStub;
beforeAll(async () => {
  stub = await startStub();
});
afterAll(async () => {
  await stub.close();
});
let app: INestApplication;
let cookie: string;

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
const api = (method: Method, path: string, authed = true) => {
  const r = request(app.getHttpServer())[method](`/api${path}`);
  return authed ? r.set('Cookie', cookie) : r;
};
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../test/fixtures/device-config/${name}`, import.meta.url), 'utf8'));
const EMPTY = { blockWords: [], enabledPacks: [], siteWords: {}, siteOptions: {}, quietHours: null };
const make = async (name = 'Kid', body: object = {}) =>
  (await api('post', '/profiles').send({ name, ...body }).expect(201)).body as ProfileWithRules;
const put = (p: { id: string }, version: number | string | undefined, body: object) => {
  const r = api('put', `/profiles/${p.id}/rules`);
  if (version !== undefined) r.set('If-Match', String(version));
  return r.send(body);
};
const stored = (id: string) => prismaOf(app).ruleSet.findUniqueOrThrow({ where: { profileId: id } });

beforeEach(async () => {
  process.env = {
    ...saved,
    ...ssoEnv(stub),
  };
  app = await createTestApp();
  await resetDb(prismaOf(app));
  await app.close();
  app = await createTestApp();
  cookie = await adminCookie(app, stub);
});

afterEach(async () => {
  await app.close();
  process.env = saved;
});

describe('auth', () => {
  it.each([
    ['get', '/templates'],
    ['get', '/profiles'],
    ['post', '/profiles'],
    ['get', '/profiles/6f1c2d3e-0000-4000-8000-000000000000'],
    ['patch', '/profiles/6f1c2d3e-0000-4000-8000-000000000000'],
    ['put', '/profiles/6f1c2d3e-0000-4000-8000-000000000000/rules'],
    ['delete', '/profiles/6f1c2d3e-0000-4000-8000-000000000000'],
  ] as const)('%s %s without a session is 401', async (m, p) => {
    await api(m, p, false).expect(401);
  });
});

describe('templates', () => {
  it('GET /templates serves the constant', async () => {
    const res = await api('get', '/templates').expect(200);
    expect(res.body).toEqual(TEMPLATES);
  });
});

describe('create', () => {
  it.each(TEMPLATES)('from $id yields its rules and locked', async (t) => {
    const p = await make(`From ${t.id}`, { templateId: t.id });
    expect(p.rules).toEqual(t.rules);
    expect(p.locked).toBe(t.locked);
    expect(p.version).toBe(1);
    expect((await api('get', `/profiles/${p.id}`).expect(200)).body).toEqual(p);
  });

  it('an explicit locked wins over the template', async () => {
    expect((await make('A', { templateId: 'young-kid', locked: false })).locked).toBe(false);
    expect((await make('B', { templateId: 'calm-adult', locked: true })).locked).toBe(true);
  });

  it('without a template yields the empty rule set', async () => {
    const p = await make('Empty');
    expect(p.rules).toEqual(EMPTY);
    expect(p.locked).toBe(false);
  });

  it('duplicate name, any case, is 409 name_taken', async () => {
    await make('Kid');
    const res = await api('post', '/profiles').send({ name: 'kID' }).expect(409);
    expect(res.body.error).toBe('name_taken');
  });

  it.each([{}, { name: '   ' }, { name: 'x', templateId: 'nope' }])('rejects %j with 400', async (body) => {
    await api('post', '/profiles').send(body).expect(400);
  });
});

describe('read', () => {
  it('lists profiles ordered by name with rules', async () => {
    await make('Zed');
    await make('Amy', { templateId: 'teen' });
    const list = (await api('get', '/profiles').expect(200)).body as ProfileWithRules[];
    expect(list.map((p) => p.name)).toEqual(['Amy', 'Zed']);
    expect(list[0]!.rules.enabledPacks).toContain('Crypto');
  });

  it('is 404 for an unknown id and 400 for a malformed one', async () => {
    const res = await api('get', '/profiles/6f1c2d3e-0000-4000-8000-000000000000').expect(404);
    expect(res.body.error).toBe('not_found');
    await api('get', '/profiles/nope').expect(400);
  });
});

describe('patch', () => {
  it('renaming does not bump the version', async () => {
    const p = await make('Kid');
    const res = await api('patch', `/profiles/${p.id}`).send({ name: 'Child' }).expect(200);
    expect(res.body.name).toBe('Child');
    expect(res.body.version).toBe(1);
  });

  it('toggling locked bumps the version; resending the same value does not', async () => {
    const p = await make('Kid');
    let res = await api('patch', `/profiles/${p.id}`).send({ locked: true }).expect(200);
    expect([res.body.locked, res.body.version]).toEqual([true, 2]);
    res = await api('patch', `/profiles/${p.id}`).send({ locked: true }).expect(200);
    expect(res.body.version).toBe(2);
    res = await api('patch', `/profiles/${p.id}`).send({ locked: false }).expect(200);
    expect([res.body.locked, res.body.version]).toEqual([false, 3]);
  });

  it('rename to another profile’s name is 409, to its own name in another case is fine', async () => {
    await make('Kid');
    const me = await make('Me');
    await api('patch', `/profiles/${me.id}`).send({ name: 'KID' }).expect(409);
    await api('patch', `/profiles/${me.id}`).send({ name: 'ME' }).expect(200);
  });

  it('is 404 for an unknown profile', async () => {
    await api('patch', '/profiles/6f1c2d3e-0000-4000-8000-000000000000').send({ locked: true }).expect(404);
  });
});

describe('PUT rules', () => {
  const rules = { ...EMPTY, blockWords: ['  spoiler  ', '=cat'], siteWords: { Reddit: ['r/all'] }, siteOptions: { ytHomeRedirect: true } };

  it('without If-Match is 428', async () => {
    const p = await make();
    const res = await put(p, undefined, rules).expect(428);
    expect(res.body.error).toBe('if_match_required');
    expect((await stored(p.id)).blockWords).toEqual([]);
  });

  it('stale version is 412 with the current version and leaves the rules unchanged', async () => {
    const p = await make('Kid', { templateId: 'teen' });
    const res = await put(p, 5, rules).expect(412);
    expect(res.body).toMatchObject({ error: 'stale_version', details: { current: 1 } });
    expect((await stored(p.id)).blockWords).toEqual(p.rules.blockWords);
  });

  it.each(['abc', '-1', '1.5'])('unparseable If-Match %j is 412', async (v) => {
    const p = await make();
    await put(p, v, rules).expect(412);
  });

  it('accepts a quoted or weak If-Match', async () => {
    const p = await make();
    await put(p, '"1"', rules).expect(200);
    await put(p, 'W/"2"', rules).expect(200);
  });

  it('success stores words trimmed and verbatim, bumps version by one and returns the new version', async () => {
    const p = await make();
    const res = await put(p, 1, rules).expect(200);
    expect(res.body.version).toBe(2);
    expect(res.body.rules.blockWords).toEqual(['spoiler', '=cat']);
    expect(res.body.rules.siteWords).toEqual({ Reddit: ['r/all'] });
    expect((await api('get', `/profiles/${p.id}`)).body).toEqual(res.body);
    await put(p, 1, rules).expect(412);
    expect((await put(p, 2, rules).expect(200)).body.version).toBe(3);
  });

  it('an empty rule set clears quietHours back to null', async () => {
    const p = await make();
    const q = { timezone: 'Europe/Brussels', windows: [{ days: [1], start: '21:00', end: '07:00' }] };
    expect((await put(p, 1, { ...EMPTY, quietHours: q }).expect(200)).body.rules.quietHours).toEqual(q);
    expect((await put(p, 2, EMPTY).expect(200)).body.rules.quietHours).toBeNull();
  });

  it('two concurrent PUTs with the same If-Match: exactly one 200 and one 412', async () => {
    const p = await make();
    const results = await Promise.all([
      put(p, 1, { ...EMPTY, blockWords: ['one'] }),
      put(p, 1, { ...EMPTY, blockWords: ['two'] }),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 412]);
    const winner = results.find((r) => r.status === 200)!;
    expect((await stored(p.id)).blockWords).toEqual(winner.body.rules.blockWords);
    expect((await api('get', `/profiles/${p.id}`)).body.version).toBe(2);
  });

  it('accepts the rule fields of valid-full.json', async () => {
    const full = fixture('valid-full.json');
    const body = {
      blockWords: full.blockWords,
      enabledPacks: ['Spoilers'],
      siteWords: full.siteWords,
      siteOptions: full.siteOptions,
      quietHours: full.quietHours,
    };
    const p = await make();
    const res = await put(p, 1, body).expect(200);
    expect(res.body.rules).toEqual(body);
  });

  it('valid-minimal.json rule fields succeed', async () => {
    const min = fixture('valid-minimal.json');
    const p = await make();
    await put(p, 1, {
      blockWords: min.blockWords,
      enabledPacks: [],
      siteWords: min.siteWords,
      siteOptions: min.siteOptions,
      quietHours: min.quietHours,
    }).expect(200);
  });

  it.each([
    'invalid-bad-timezone.json',
    'invalid-bad-window.json',
    'invalid-empty-word.json',
    'invalid-equal-window.json',
    'invalid-too-many-words.json',
    'invalid-unknown-site.json',
  ])('%s fails 400 with Zod issues and changes nothing', async (name) => {
    const f = fixture(name);
    const body = {
      blockWords: f.blockWords,
      enabledPacks: [],
      siteWords: f.siteWords,
      siteOptions: f.siteOptions,
      quietHours: f.quietHours,
    };
    const p = await make();
    const res = await put(p, 1, body).expect(400);
    expect(res.body.error).toBe('validation');
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(res.body.details[0].path).toBeDefined();
    expect((await api('get', `/profiles/${p.id}`)).body.version).toBe(1);
  });

  it('unknown pack is 422 unknown_pack with the name', async () => {
    const p = await make();
    const res = await put(p, 1, { ...EMPTY, enabledPacks: ['Crypto', 'Nope'] }).expect(422);
    expect(res.body).toMatchObject({ error: 'unknown_pack', details: { name: 'Nope' } });
    expect((await stored(p.id)).enabledPacks).toEqual([]);
  });

  it('a household pack is accepted', async () => {
    const p = await make();
    await api('post', '/packs').send({ name: 'Mine', words: ['x'] }).expect(201);
    await put(p, 1, { ...EMPTY, enabledPacks: ['Mine'] }).expect(200);
  });

  it('duplicate words, case-insensitive, are 400 duplicate_word in blockWords and in one site list', async () => {
    const p = await make();
    let res = await put(p, 1, { ...EMPTY, blockWords: ['Cat', 'cat'] }).expect(400);
    expect(res.body.error).toBe('duplicate_word');
    res = await put(p, 1, { ...EMPTY, siteWords: { X: ['a', ' A '] } }).expect(400);
    expect(res.body.error).toBe('duplicate_word');
    // The same word in different lists is allowed (the lists are never folded).
    await put(p, 1, { ...EMPTY, blockWords: ['cat'], siteWords: { X: ['cat'], Reddit: ['cat'] } }).expect(200);
  });

  it('is 404 for an unknown profile', async () => {
    await put({ id: '6f1c2d3e-0000-4000-8000-000000000000' }, 1, EMPTY).expect(404);
  });
});

describe('delete', () => {
  const addDevice = (profileId: string, revoked: boolean) =>
    prismaOf(app).device.create({
      data: { profileId, label: 'L', tokenHash: Math.random().toString(36), revokedAt: revoked ? new Date() : null },
    });

  it('is 409 profile_in_use with a paired device, 204 after revoke, removing devices, codes and rules', async () => {
    const p = await make();
    const dev = await addDevice(p.id, false);
    await addDevice(p.id, true);
    await prismaOf(app).pairingCode.create({ data: { code: 'ABC234', profileId: p.id, expiresAt: new Date(Date.now() + 60000) } });
    const res = await api('delete', `/profiles/${p.id}`).expect(409);
    expect(res.body).toMatchObject({ error: 'profile_in_use', details: { deviceCount: 1 } });
    await api('get', `/profiles/${p.id}`).expect(200);

    await prismaOf(app).device.update({ where: { id: dev.id }, data: { revokedAt: new Date() } });
    await api('delete', `/profiles/${p.id}`).expect(204);
    await api('get', `/profiles/${p.id}`).expect(404);
    const db = prismaOf(app);
    expect(await db.device.count()).toBe(0);
    expect(await db.pairingCode.count()).toBe(0);
    expect(await db.ruleSet.count()).toBe(0);
  });

  it('is 404 for an unknown profile', async () => {
    await api('delete', '/profiles/6f1c2d3e-0000-4000-8000-000000000000').expect(404);
  });
});
