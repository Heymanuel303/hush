import type { INestApplication } from '@nestjs/common';
import { PiholeConnection, PiholeSummary, PiholeTestResult } from 'contracts';
import request from 'supertest';
import { SecretsService } from '../src/common/secrets.service.js';
import { loadConfig } from '../src/config/config.js';
import { PiholeService } from '../src/pihole/pihole.service.js';
import { createTestApp, prismaOf, resetDb } from './db.js';
import { startFakePihole } from './fake-pihole.js';
import type { FakePihole } from './fake-pihole.js';

const saved = { ...process.env };
const PASSWORD = 'app-password-123';
let app: INestApplication;
let cookie: string;
let fake: FakePihole;

const api = (method: 'get' | 'put' | 'post' | 'delete', path: string, authed = true) => {
  const r = request(app.getHttpServer())[method](`/api${path}`);
  return authed ? r.set('Cookie', cookie) : r;
};
const connect = (extra: Record<string, unknown> = {}) =>
  api('put', '/pihole').send({ url: fake.url, appPassword: PASSWORD, kidGroupName: 'Kid', ...extra });
const authCalls = () => fake.calls['POST /api/auth'] ?? 0;

beforeEach(async () => {
  process.env = {
    ...saved,
    ADMIN_EMAIL: 'parent@example.test',
    ADMIN_PASSWORD: 'correct horse battery',
    SESSION_SECRET: 'test-session-secret',
    COOKIE_SECURE: 'false',
  };
  fake = await startFakePihole({ password: PASSWORD });
  app = await createTestApp();
  await resetDb(prismaOf(app));
  await app.close();
  app = await createTestApp();
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'parent@example.test', password: 'correct horse battery' })
    .expect(200);
  cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
});

afterEach(async () => {
  await app.close();
  await fake.close();
  process.env = saved;
});

describe('SecretsService', () => {
  const key = Buffer.alloc(32, 7);
  const secrets = new SecretsService({ encryptionKey: key });

  it('roundtrips and uses the v1 format with a fresh iv each time', () => {
    const a = secrets.encrypt('hunter2');
    const b = secrets.encrypt('hunter2');
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]*$/);
    expect(a).not.toContain('hunter2');
    expect(a).not.toBe(b);
    expect(secrets.decrypt(a)).toBe('hunter2');
    expect(secrets.decrypt(secrets.encrypt(''))).toBe('');
  });

  it('detects tampering, a wrong key and a bad format', () => {
    const [v, iv, tag, body] = secrets.encrypt('hunter2').split(':') as [string, string, string, string];
    const flipped = Buffer.from(body, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => secrets.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
    const badTag = Buffer.from(tag, 'base64');
    badTag[0] = badTag[0]! ^ 1;
    expect(() => secrets.decrypt([v, iv, badTag.toString('base64'), body].join(':'))).toThrow();
    expect(() => new SecretsService({ encryptionKey: Buffer.alloc(32, 8) }).decrypt(`${v}:${iv}:${tag}:${body}`)).toThrow();
    expect(() => secrets.decrypt('v2:a:b:c')).toThrow();
    expect(() => secrets.decrypt('nonsense')).toThrow();
  });
});

describe('config', () => {
  it('production refuses to start without HUB_ENCRYPTION_KEY', () => {
    const env = { NODE_ENV: 'production', ADMIN_EMAIL: 'a@b.test', ADMIN_PASSWORD: 'x', SESSION_SECRET: 'y' };
    expect(() => loadConfig(env)).toThrow(/HUB_ENCRYPTION_KEY/);
    expect(loadConfig({ ...env, HUB_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') }).encryptionKey).toHaveLength(32);
  });

  it('rejects a key that is not 32 bytes; development warns and defaults', () => {
    expect(() => loadConfig({ HUB_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/32 bytes/);
    const warnings: string[] = [];
    const cfg = loadConfig({}, (m) => warnings.push(m));
    expect(cfg.encryptionKey).toHaveLength(32);
    expect(cfg.piholeTlsInsecure).toBe(false);
    expect(warnings.join()).toContain('HUB_ENCRYPTION_KEY');
    expect(loadConfig({ PIHOLE_TLS_INSECURE: 'true' }).piholeTlsInsecure).toBe(true);
  });
});

describe('auth', () => {
  it.each([
    ['get', '/pihole'],
    ['put', '/pihole'],
    ['delete', '/pihole'],
    ['post', '/pihole/test'],
    ['get', '/pihole/summary'],
  ] as const)('%s %s without a session is 401', async (m, p) => {
    const res = await api(m, p, false).send({}).expect(401);
    expect(res.body.error).toBe('unauthenticated');
  });
});

describe('connection', () => {
  it('is 404 not_configured before anything is saved', async () => {
    for (const [m, p] of [['get', '/pihole'], ['get', '/pihole/summary'], ['post', '/pihole/test']] as const) {
      const res = await api(m, p).expect(404);
      expect(res.body.error).toBe('not_configured');
    }
  });

  it('PUT stores the secret encrypted and GET never returns it', async () => {
    const put = await connect({ url: `${fake.url}/` }).expect(200);
    expect(() => PiholeConnection.parse(put.body)).not.toThrow();
    expect(put.body).toMatchObject({ url: fake.url, kidGroupName: 'Kid', hasSecret: true });
    const row = await prismaOf(app).piholeConnection.findUniqueOrThrow({ where: { id: 1 } });
    expect(row.secretEnc).not.toContain(PASSWORD);
    expect(row.secretEnc.startsWith('v1:')).toBe(true);
    expect(app.get(SecretsService).decrypt(row.secretEnc)).toBe(PASSWORD);
    const got = await api('get', '/pihole').expect(200);
    expect(JSON.stringify(got.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(got.body)).not.toContain('v1:');
    expect(got.body).not.toHaveProperty('appPassword');
    expect(got.body).not.toHaveProperty('secretEnc');
  });

  it('normalises the URL: origin plus path prefix, no trailing slash, query or fragment', async () => {
    const res = await connect({ url: 'https://pihole.lan:8443/admin-prefix//?x=1#f' }).expect(200);
    expect(res.body.url).toBe('https://pihole.lan:8443/admin-prefix');
    expect((await connect({ url: 'http://pihole.lan/' }).expect(200)).body.url).toBe('http://pihole.lan');
  });

  it('PUT without appPassword keeps the stored one; first PUT without it is 400', async () => {
    const first = await api('put', '/pihole').send({ url: fake.url, kidGroupName: 'Kid' }).expect(400);
    expect(first.body.error).toBe('secret_required');
    await connect().expect(200);
    const before = (await prismaOf(app).piholeConnection.findUniqueOrThrow({ where: { id: 1 } })).secretEnc;
    const res = await api('put', '/pihole').send({ url: fake.url, kidGroupName: 'Children' }).expect(200);
    expect(res.body.kidGroupName).toBe('Children');
    const after = await prismaOf(app).piholeConnection.findUniqueOrThrow({ where: { id: 1 } });
    expect(after.secretEnc).toBe(before);
    expect(after.kidGroupName).toBe('Children');
    expect((await api('post', '/pihole/test').expect(200)).body.ok).toBe(true);
  });

  it.each([
    { url: 'ftp://pihole.lan' },
    { url: 'not a url' },
    { appPassword: '' },
    { kidGroupName: '' },
  ])('rejects invalid input %j', async (bad) => {
    await connect(bad).expect(400);
  });

  it('DELETE is 204, removes the row and logs the live session out', async () => {
    await connect().expect(200);
    await api('post', '/pihole/test').expect(200);
    expect(fake.state.sessions.size).toBe(1);
    await api('delete', '/pihole').expect(204);
    expect(fake.calls['DELETE /api/auth']).toBe(1);
    expect(fake.state.sessions.size).toBe(0);
    await api('get', '/pihole').expect(404);
    await api('delete', '/pihole').expect(204);
  });

  it('changing the stored connection logs the old session out', async () => {
    await connect().expect(200);
    await api('post', '/pihole/test').expect(200);
    await connect({ kidGroupName: 'Other' }).expect(200);
    expect(fake.calls['DELETE /api/auth']).toBe(1);
    expect(fake.state.sessions.size).toBe(0);
  });
});

describe('POST /api/pihole/test', () => {
  it('returns version and groups and sets lastCheckedAt', async () => {
    await connect().expect(200);
    expect((await api('get', '/pihole')).body.lastCheckedAt).toBeNull();
    const res = await api('post', '/pihole/test').expect(200);
    expect(() => PiholeTestResult.parse(res.body)).not.toThrow();
    expect(res.body).toMatchObject({
      ok: true,
      version: 'v6.0.4',
      groups: [{ id: 0, name: 'Default' }, { id: 1, name: 'Kid' }],
    });
    const got = (await api('get', '/pihole')).body;
    expect(Date.parse(got.lastCheckedAt)).toBeGreaterThan(Date.now() - 10_000);
    expect(got.lastError).toBeNull();
  });

  it('wrong password: ok false, lastError recorded, then cleared on success', async () => {
    await connect({ appPassword: 'wrong' }).expect(200);
    const res = await api('post', '/pihole/test').expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeTruthy();
    const got = (await api('get', '/pihole')).body;
    expect(got.lastError).toBe(res.body.error);
    expect(got.lastCheckedAt).toBeTruthy();
    await connect().expect(200);
    expect((await api('post', '/pihole/test').expect(200)).body.ok).toBe(true);
    expect((await api('get', '/pihole')).body.lastError).toBeNull();
  });

  it('unreachable Pi-hole: ok false', async () => {
    await connect({ url: 'http://127.0.0.1:1' }).expect(200);
    const res = await api('post', '/pihole/test').expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/reach/i);
  });

  it('seat limit reached: reports pihole_no_seats advice', async () => {
    await fake.close();
    fake = await startFakePihole({ password: PASSWORD, seatLimit: 0 });
    await connect().expect(200);
    const res = await api('post', '/pihole/test').expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('max_sessions');
  });
});

describe('session handling', () => {
  it('authenticates once across groups(), clients() and summary()', async () => {
    await connect().expect(200);
    const { client } = await app.get(PiholeService).getClient();
    await client.groups();
    await client.clients();
    await client.summary();
    await client.topClientsBlocked(5);
    expect(authCalls()).toBe(1);
  });

  it('concurrent first calls share a single authentication', async () => {
    await connect().expect(200);
    const { client } = await app.get(PiholeService).getClient();
    await Promise.all([client.groups(), client.clients(), client.summary(), client.version()]);
    expect(authCalls()).toBe(1);
  });

  it('re-authenticates once after the sid is invalidated', async () => {
    await connect().expect(200);
    const { client } = await app.get(PiholeService).getClient();
    await client.groups();
    fake.invalidateSessions();
    await expect(client.groups()).resolves.toHaveLength(2);
    expect(authCalls()).toBe(2);
    await client.clients();
    expect(authCalls()).toBe(2);
  });

  it('renews an expired sid before using it', async () => {
    fake.state.validity = 1; // shorter than the renewal margin: never cached
    await connect().expect(200);
    const { client } = await app.get(PiholeService).getClient();
    await client.groups();
    await client.groups();
    expect(authCalls()).toBe(2);
  });

  it('shutdown issues DELETE /api/auth', async () => {
    await connect().expect(200);
    await api('post', '/pihole/test').expect(200);
    expect(fake.calls['DELETE /api/auth']).toBeUndefined();
    await app.close();
    expect(fake.calls['DELETE /api/auth']).toBe(1);
    expect(fake.state.sessions.size).toBe(0);
    app = await createTestApp();
  });

  it('seat limit surfaces as pihole_no_seats', async () => {
    await fake.close();
    fake = await startFakePihole({ password: PASSWORD, seatLimit: 0 });
    await connect().expect(200);
    const { client } = await app.get(PiholeService).getClient();
    await expect(client.groups()).rejects.toMatchObject({ code: 'pihole_no_seats' });
    const res = await api('get', '/pihole/summary').expect(502);
    expect(res.body.error).toBe('pihole_no_seats');
    expect(res.body.message).toContain('max_sessions');
  });

  it('creates and updates clients, sending every field', async () => {
    await connect().expect(200);
    const { client } = await app.get(PiholeService).getClient();
    await client.createClient('100.64.0.7', 'tablet', [0]);
    await client.setClientGroups('100.64.0.7', 'tablet', [1]);
    expect(fake.state.clients).toEqual([{ client: '100.64.0.7', comment: 'tablet', groups: [1] }]);
    expect((await client.clients())[0]!.groups).toEqual([1]);
  });
});

describe('GET /api/pihole/summary', () => {
  it('maps blocked counts per client', async () => {
    fake.state.topBlocked = [
      { ip: '100.64.0.7', name: 'tablet', count: 30 },
      { ip: '100.64.0.8', name: '', count: 12 },
    ];
    await connect().expect(200);
    const res = await api('get', '/pihole/summary').expect(200);
    expect(() => PiholeSummary.parse(res.body)).not.toThrow();
    expect(res.body.topClients).toEqual([
      { ip: '100.64.0.7', name: 'tablet', blocked: 30 },
      { ip: '100.64.0.8', name: null, blocked: 12 },
    ]);
    expect(res.body.queries).toMatchObject({ total: 142, blocked: 42 });
    expect(res.body.queries.percentBlocked).toBeCloseTo(29.58, 1);
    expect(fake.calls['GET /api/stats/top_clients']).toBe(1);
  });

  it('five calls within 30 s hit the fake once', async () => {
    await connect().expect(200);
    for (let i = 0; i < 5; i++) await api('get', '/pihole/summary').expect(200);
    expect(fake.calls['GET /api/stats/summary']).toBe(1);
    expect(fake.calls['GET /api/stats/top_clients']).toBe(1);
  });

  it('a changed connection drops the cache', async () => {
    await connect().expect(200);
    await api('get', '/pihole/summary').expect(200);
    await connect({ kidGroupName: 'Other' }).expect(200);
    await api('get', '/pihole/summary').expect(200);
    expect(fake.calls['GET /api/stats/summary']).toBe(2);
  });

  it('is 502 pihole_unreachable when Pi-hole fails, and does not cache the failure', async () => {
    await connect().expect(200);
    fake.state.down = true;
    const res = await api('get', '/pihole/summary').expect(502);
    expect(res.body.error).toBe('pihole_unreachable');
    expect(res.body.message).toBeTruthy();
    fake.state.down = false;
    await api('get', '/pihole/summary').expect(200);
  });

  it('is 502 pihole_unreachable when nothing listens', async () => {
    await connect({ url: 'http://127.0.0.1:1' }).expect(200);
    const res = await api('get', '/pihole/summary').expect(502);
    expect(res.body.error).toBe('pihole_unreachable');
  });
});
