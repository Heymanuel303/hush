import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { BUILT_IN_PACKS, DeviceConfig } from 'contracts';
import type { PairingCode, PairResponse, ProfileWithRules } from 'contracts';
import type { OidcStub } from '@heymanuel303/idp-client/testkit';
import request from 'supertest';
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
const make = async (name = 'Kid', body: object = {}) =>
  (await api('post', '/profiles').send({ name, ...body }).expect(201)).body as ProfileWithRules;
const newCode = async (profileId: string) =>
  (await api('post', `/profiles/${profileId}/pairing-codes`).expect(201)).body as PairingCode;
const pairWith = (code: string, extra: object = {}) =>
  api('post', '/devices/pair', false).send({ code, label: 'Laptop', ...extra });
const pair = async (profileId: string, extra: object = {}) => {
  const { code } = await newCode(profileId);
  return (await pairWith(code, extra).expect(201)).body as PairResponse;
};
const config = (token: string, etag?: string) => {
  const r = api('get', '/device/config', false).set('Authorization', `Bearer ${token}`);
  return etag ? r.set('If-None-Match', etag) : r;
};
const lastSeen = async (id: string) =>
  (await prismaOf(app).device.findUniqueOrThrow({ where: { id } })).lastSeenAt;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  process.env = {
    ...saved,
    ...ssoEnv(stub),
    HUB_NAME: 'Home Hub',
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

describe('admin routes need the session', () => {
  const id = '6f1c2d3e-0000-4000-8000-000000000000';
  it.each([
    ['post', `/profiles/${id}/pairing-codes`],
    ['get', '/devices'],
    ['patch', `/devices/${id}`],
    ['delete', `/devices/${id}`],
  ] as const)('%s %s without a session is 401', async (m, p) => {
    await api(m, p, false).expect(401);
  });
});

describe('pairing codes', () => {
  it('has six characters from the alphabet and a ten minute expiry', async () => {
    const p = await make();
    const before = Date.now();
    const codes = await Promise.all(Array.from({ length: 20 }, () => newCode(p.id)));
    for (const c of codes) {
      expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(c.profileId).toBe(p.id);
      const ttl = Date.parse(c.expiresAt) - before;
      expect(ttl).toBeGreaterThan(9.9 * 60_000);
      expect(ttl).toBeLessThan(10.1 * 60_000);
    }
  });

  it('unknown profile is 404', async () => {
    await api('post', '/profiles/6f1c2d3e-0000-4000-8000-000000000000/pairing-codes').expect(404);
  });

  it('creation deletes codes expired or consumed more than a day ago, keeps recent ones', async () => {
    const p = await make();
    const db = prismaOf(app).pairingCode;
    const day = 24 * 60 * 60_000;
    const old = new Date(Date.now() - 2 * day);
    await db.create({ data: { code: 'OLDEXP', profileId: p.id, expiresAt: old } });
    await db.create({
      data: { code: 'OLDUSE', profileId: p.id, expiresAt: new Date(Date.now() + 1000), consumedAt: old },
    });
    await db.create({ data: { code: 'NEWEXP', profileId: p.id, expiresAt: new Date(Date.now() - 1000) } });
    await newCode(p.id);
    const left = (await db.findMany()).map((c) => c.code);
    expect(left).toContain('NEWEXP');
    expect(left).not.toContain('OLDEXP');
    expect(left).not.toContain('OLDUSE');
  });
});

describe('pair', () => {
  it('returns a 43-char token with the profile and hub names, stores only the hash', async () => {
    const p = await make('Kid');
    const { code } = await newCode(p.id);
    const res = await pairWith(code, { browser: 'firefox' }).expect(201);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body).toMatchObject({ profileName: 'Kid', hubName: 'Home Hub' });
    const row = await prismaOf(app).device.findUniqueOrThrow({ where: { id: res.body.deviceId } });
    expect(row.tokenHash).toBe(createHash('sha256').update(res.body.token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(res.body.token);
    expect(row).toMatchObject({ profileId: p.id, label: 'Laptop', browser: 'firefox', lastSeenAt: null });
  });

  it('accepts a lowercase code', async () => {
    const p = await make();
    const { code } = await newCode(p.id);
    await pairWith(code.toLowerCase()).expect(201);
  });

  it('unknown code is 404 unknown_code', async () => {
    const res = await pairWith('ABCDEF').expect(404);
    expect(res.body.error).toBe('unknown_code');
  });

  it('expired code is 410 code_expired and creates no device', async () => {
    const p = await make();
    await prismaOf(app).pairingCode.create({
      data: { code: 'EXPRDX', profileId: p.id, expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await pairWith('EXPRDX').expect(410);
    expect(res.body.error).toBe('code_expired');
    expect(await prismaOf(app).device.count()).toBe(0);
  });

  it('a used code is 410 code_used', async () => {
    const p = await make();
    const { code } = await newCode(p.id);
    await pairWith(code).expect(201);
    expect((await pairWith(code).expect(410)).body.error).toBe('code_used');
  });

  it.each([{}, { code: 'ABC' }, { code: 'ABCDE0' }, { code: 'ABCDEF' }, { code: 'ABCDEF', label: '  ' }, { code: 'ABCDEF', label: 'x', browser: 'ie' }, { code: 5, label: 'x' }])(
    'rejects malformed %j with 400',
    async (body) => {
      await api('post', '/devices/pair', false).send(body).expect(400);
    },
  );

  it('ten concurrent pairs on one code give one 201 and nine 410', async () => {
    const p = await make();
    const { code } = await newCode(p.id);
    const results = await Promise.all(Array.from({ length: 10 }, () => pairWith(code)));
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, ...Array<number>(9).fill(410)]);
    expect(await prismaOf(app).device.count()).toBe(1);
  });

  it('21 rapid pairs from one IP end in 429 too_many_attempts', async () => {
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 21; i++) {
      last = await pairWith('ABCDEF');
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(last!.body.error).toBe('too_many_attempts');
  });
});

describe('device config', () => {
  it('rejects a missing, malformed, unknown or revoked token with 401 revoked', async () => {
    const p = await make();
    const d = await pair(p.id);
    await api('get', '/device/config', false).expect(401);
    for (const auth of ['Bearer nope', `Bearer ${'A'.repeat(43)}`, `Basic ${d.token}`]) {
      const res = await api('get', '/device/config', false).set('Authorization', auth).expect(401);
      expect(res.body.error).toBe('revoked');
    }
    await config(d.token).expect(200);
    await api('delete', `/devices/${d.deviceId}`).expect(204);
    expect((await config(d.token).expect(401)).body.error).toBe('revoked');
  });

  it('200 carries the ETag, no-cache and the full shape with pack words', async () => {
    const built = BUILT_IN_PACKS[0]!;
    const house = (await api('post', '/packs').send({ name: 'Family', words: ['alpha', '=beta'] }).expect(201)).body;
    const p = await make('Kid');
    await api('put', `/profiles/${p.id}/rules`).set('If-Match', '1').send({
      blockWords: ['spoiler'],
      enabledPacks: [house.name, built.name],
      siteWords: { Reddit: ['x'] },
      siteOptions: { ytHomeRedirect: true },
      quietHours: null,
    }).expect(200);
    const d = await pair(p.id);
    const res = await config(d.token).expect(200);
    expect(res.headers.etag).toBe(`"${p.id}:2"`);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(DeviceConfig.parse(res.body)).toEqual(res.body);
    expect(res.body).toMatchObject({
      version: 2,
      profileName: 'Kid',
      locked: false,
      blockWords: ['spoiler'],
      enabledPacks: ['Family', built.name],
      siteWords: { Reddit: ['x'] },
      siteOptions: { ytHomeRedirect: true },
      quietHours: null,
    });
    expect(res.body.packs).toEqual([
      { name: 'Family', words: ['alpha', '=beta'] },
      { name: built.name, words: built.words },
    ]);
  });

  it('If-None-Match with the current ETag is 304 with the same ETag and no body', async () => {
    const p = await make();
    const d = await pair(p.id);
    const etag = (await config(d.token).expect(200)).headers.etag!;
    const res = await config(d.token, etag).expect(304);
    expect(res.headers.etag).toBe(etag);
    expect(res.text ?? '').toBe('');
    await config(d.token, `"${p.id}:99"`).expect(200);
  });

  it('a rules edit changes the ETag; locked shows up', async () => {
    const p = await make();
    const d = await pair(p.id);
    const etag = (await config(d.token).expect(200)).headers.etag!;
    await api('put', `/profiles/${p.id}/rules`).set('If-Match', '1').send({
      blockWords: ['a'], enabledPacks: [], siteWords: {}, siteOptions: {}, quietHours: null,
    }).expect(200);
    const res = await config(d.token, etag).expect(200);
    expect(res.headers.etag).not.toBe(etag);
    expect(res.body.blockWords).toEqual(['a']);
    await api('patch', `/profiles/${p.id}`).send({ locked: true }).expect(200);
    expect((await config(d.token).expect(200)).body.locked).toBe(true);
  });

  it('a pack rename follows into enabledPacks and packs; unknown names are dropped', async () => {
    const house = (await api('post', '/packs').send({ name: 'Old', words: ['w'] }).expect(201)).body;
    const p = await make();
    // The rules API refuses unknown pack names, so a dangling one is planted directly.
    await api('put', `/profiles/${p.id}/rules`).set('If-Match', '1').send({
      blockWords: [], enabledPacks: ['Old'], siteWords: {}, siteOptions: {}, quietHours: null,
    }).expect(200);
    await prismaOf(app).ruleSet.update({ where: { profileId: p.id }, data: { enabledPacks: ['Ghost', 'Old'] } });
    const d = await pair(p.id);
    let body = (await config(d.token).expect(200)).body;
    expect(body.enabledPacks).toEqual(['Old']);
    expect(body.packs).toEqual([{ name: 'Old', words: ['w'] }]);
    await api('patch', `/packs/${house.id}`).send({ name: 'New' }).expect(200);
    body = (await config(d.token).expect(200)).body;
    expect(body.enabledPacks).toEqual(['New']);
    expect(body.packs).toEqual([{ name: 'New', words: ['w'] }]);
  });

  it('lastSeenAt moves on 200 and 304, and stops after revoke', async () => {
    const p = await make();
    const d = await pair(p.id);
    expect(await lastSeen(d.deviceId)).toBeNull();
    const etag = (await config(d.token).expect(200)).headers.etag!;
    const first = (await lastSeen(d.deviceId))!;
    expect(first).not.toBeNull();
    await sleep(15);
    await config(d.token, etag).expect(304);
    const second = (await lastSeen(d.deviceId))!;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    await api('delete', `/devices/${d.deviceId}`).expect(204);
    await sleep(15);
    await config(d.token).expect(401);
    expect(await lastSeen(d.deviceId)).toEqual(second);
  });
});

describe('devices admin', () => {
  it('lists newest first including revoked, never exposes the token or its hash', async () => {
    const p = await make();
    const a = await pair(p.id, { label: 'A' });
    await sleep(5);
    const b = await pair(p.id, { label: 'B', browser: 'chrome' });
    await api('delete', `/devices/${a.deviceId}`).expect(204);
    const res = await api('get', '/devices').expect(200);
    expect(res.body.map((x: { label: string }) => x.label)).toEqual(['B', 'A']);
    expect(res.body[1].revokedAt).toEqual(expect.any(String));
    expect(res.body[0]).toMatchObject({
      browser: 'chrome',
      revokedAt: null,
      kidMode: { enabled: false, schedule: null, state: 'unknown' },
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(a.token);
    expect(text).not.toContain(b.token);
    expect(text).not.toContain('tokenHash');
    expect(text).not.toContain(createHash('sha256').update(b.token).digest('hex'));
  });

  it('PATCH changes label, ip and profile; the next pull has the new ETag', async () => {
    const p1 = await make('One');
    const p2 = await make('Two');
    const d = await pair(p1.id);
    const e1 = (await config(d.token).expect(200)).headers.etag!;
    const res = await api('patch', `/devices/${d.deviceId}`)
      .send({ label: 'Desk', profileId: p2.id, tailscaleIp: '100.64.0.7' })
      .expect(200);
    expect(res.body).toMatchObject({ label: 'Desk', profileId: p2.id, tailscaleIp: '100.64.0.7' });
    const pulled = await config(d.token, e1).expect(200);
    expect(pulled.headers.etag).toBe(`"${p2.id}:1"`);
    expect(pulled.body.profileName).toBe('Two');
    const cleared = await api('patch', `/devices/${d.deviceId}`).send({ tailscaleIp: null }).expect(200);
    expect(cleared.body.tailscaleIp).toBeNull();
  });

  it('PATCH errors: unknown profile 422, unknown device 404, bad ip 400', async () => {
    const p = await make();
    const d = await pair(p.id);
    const ghost = '6f1c2d3e-0000-4000-8000-000000000000';
    expect((await api('patch', `/devices/${d.deviceId}`).send({ profileId: ghost }).expect(422)).body.error).toBe('unknown_profile');
    await api('patch', `/devices/${ghost}`).send({ label: 'x' }).expect(404);
    await api('patch', `/devices/${d.deviceId}`).send({ tailscaleIp: 'not-an-ip' }).expect(400);
  });

  it('DELETE is idempotent, keeps the first revokedAt and cannot be undone; unknown is 404', async () => {
    const p = await make();
    const d = await pair(p.id);
    await api('delete', `/devices/${d.deviceId}`).expect(204);
    const first = (await prismaOf(app).device.findUniqueOrThrow({ where: { id: d.deviceId } })).revokedAt!;
    await sleep(10);
    await api('delete', `/devices/${d.deviceId}`).expect(204);
    const again = (await prismaOf(app).device.findUniqueOrThrow({ where: { id: d.deviceId } })).revokedAt!;
    expect(again).toEqual(first);
    await api('delete', '/devices/6f1c2d3e-0000-4000-8000-000000000000').expect(404);
    await config(d.token).expect(401);
  });
});
