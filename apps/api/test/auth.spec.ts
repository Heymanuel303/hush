import type { INestApplication } from '@nestjs/common';
import type { OidcStub } from '@heymanuel303/idp-client/testkit';
import { ErrorBody } from 'contracts';
import request from 'supertest';
import { AdminService } from '../src/auth/admin.service.js';
import { loadConfig } from '../src/config/config.js';
import { createTestApp, prismaOf, resetDb } from './db.js';
import { ADMIN_EMAIL, CLIENT_ID, PUBLIC_URL, signInThroughStub, ssoEnv, startStub } from './sso.js';

const saved = { ...process.env };
let stub: OidcStub;
let app: INestApplication;

const setEnv = (extra: Record<string, string> = {}): void => {
  process.env = { ...saved, ...ssoEnv(stub, extra) };
};
const me = (cookie?: string) => {
  const r = request(app.getHttpServer()).get('/api/auth/me');
  return cookie ? r.set('Cookie', cookie) : r;
};
const signIn = async (email = ADMIN_EMAIL) => signInThroughStub(app, stub, email);
const adminCookie = async (): Promise<string> => {
  const { cookie } = await signIn();
  if (!cookie) throw new Error('admin sign-in was refused');
  return cookie;
};

beforeAll(async () => {
  stub = await startStub();
});
afterAll(async () => {
  await stub.close();
});

beforeEach(async () => {
  setEnv();
  app = await createTestApp();
  await resetDb(prismaOf(app));
  await app.close();
  app = await createTestApp(); // boot on an empty database: creates the admin
});

afterEach(async () => {
  await app.close();
  process.env = saved;
});

describe('admin sync on boot', () => {
  it('lets two processes bootstrap an empty database at once: one admin row, both resolve', async () => {
    const prisma = prismaOf(app);
    await prisma.admin.deleteMany();
    const admins = app.get(AdminService);
    await expect(
      Promise.all([admins.onApplicationBootstrap(), admins.onApplicationBootstrap()]),
    ).resolves.toBeDefined();
    expect(await prisma.admin.count()).toBe(1);
  });

  it('still rejects when creating the admin fails for any other reason', async () => {
    const prisma = prismaOf(app);
    await prisma.admin.deleteMany();
    const create = vi.spyOn(prisma.admin, 'create').mockRejectedValueOnce(new Error('connection lost'));
    await expect(app.get(AdminService).onApplicationBootstrap()).rejects.toThrow('connection lost');
    create.mockRestore();
  });

  it('creates the admin from env with no sub yet and reports it configured', async () => {
    const rows = await prismaOf(app).admin.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: ADMIN_EMAIL, idpSub: null });
    expect(Object.keys(rows[0]!)).not.toContain('passwordHash');
    const res = await request(app.getHttpServer()).get('/api/setup/status').expect(200);
    expect(res.body).toEqual({ adminConfigured: true });
  });

  it('updates a changed ADMIN_EMAIL in place and keeps the linked sub', async () => {
    await adminCookie();
    const before = await prismaOf(app).admin.findFirstOrThrow();
    expect(before.idpSub).toBeTruthy();
    await app.close();
    setEnv({ ADMIN_EMAIL: 'other@example.test' });
    app = await createTestApp();
    const rows = await prismaOf(app).admin.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: before.id, email: 'other@example.test', idpSub: before.idpSub });
  });
});

describe('sign-in through the idp stub', () => {
  it('sets an HttpOnly SameSite=Lax hush_session cookie, stores the sub, and me answers', async () => {
    const { callback, cookie } = await signIn();
    expect(callback.status).toBe(302);
    expect(callback.headers['location']).toBe('/');
    const setCookie = (callback.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('hush_session='),
    )!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).not.toMatch(/Secure/i); // PUBLIC_URL is http in the tests
    const res = await me(cookie).expect(200);
    expect(res.body).toEqual({ email: ADMIN_EMAIL });

    const admin = await prismaOf(app).admin.findFirstOrThrow({ include: { sessions: true } });
    expect(admin.idpSub).toBe(stub.users.get(ADMIN_EMAIL)!.sub);
    expect(admin.sessions).toHaveLength(1);
    expect(`hush_session=${admin.sessions[0]!.id}`).toBe(cookie);
  });

  it('a second sign-in matches by the stored sub and adds a session without a second admin', async () => {
    const first = await adminCookie();
    const second = await adminCookie();
    expect(second).not.toBe(first);
    await me(first).expect(200);
    await me(second).expect(200);
    expect(await prismaOf(app).admin.count()).toBe(1);
    expect(await prismaOf(app).adminSession.count()).toBe(2);
  });

  it('another email is refused: redirect to /signin?error=not_an_admin, no cookie, no row', async () => {
    const { callback, cookie } = await signIn('stranger@example.test');
    expect(callback.status).toBe(302);
    expect(callback.headers['location']).toBe('/signin?error=not_an_admin');
    expect(cookie).toBeUndefined();
    expect(await prismaOf(app).admin.count()).toBe(1);
    expect(await prismaOf(app).adminSession.count()).toBe(0);
    expect((await prismaOf(app).admin.findFirstOrThrow()).idpSub).toBeNull();
  });

  it('the admin email with an unverified idp email is refused too', async () => {
    const email = 'parent+unverified@example.test';
    await prismaOf(app).admin.updateMany({ data: { email } });
    await app.close();
    setEnv({ ADMIN_EMAIL: email });
    app = await createTestApp();
    const { callback, cookie } = await signIn(email);
    expect(callback.headers['location']).toBe('/signin?error=not_an_admin');
    expect(cookie).toBeUndefined();
  });

  it('a callback without a pending login is login_expired, not a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/sso/callback?code=x&state=y');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/signin?error=login_expired');
    expect(((res.headers['set-cookie'] ?? []) as unknown as string[]).join(';')).not.toMatch(/hush_session=[^;]/);
  });

  it('login redirects to the stub with PKCE S256 and the registered redirect_uri', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/sso/login').expect(302);
    const url = new URL(res.headers['location'] as string);
    expect(url.origin).toBe(new URL(stub.issuer).origin);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(`${PUBLIC_URL}/api/auth/sso/callback`);
    expect(url.searchParams.get('scope')).toBe('openid email offline_access');
  });
});

describe('session cookie', () => {
  it('no cookie → 401 unauthenticated in the ErrorBody shape', async () => {
    const res = await me().expect(401);
    expect(res.body.error).toBe('unauthenticated');
    expect(ErrorBody.safeParse(res.body).success).toBe(true);
  });

  it('a tampered or unknown id → 401', async () => {
    const cookie = await adminCookie();
    const id = cookie.slice('hush_session='.length);
    await me(`hush_session=${id.slice(0, -2)}AA`).expect(401);
    await me(`hush_session=${id}x`).expect(401);
    await me('hush_session=garbage').expect(401);
    await me('hush_session=').expect(401);
    await me('hush_session=00000000-0000-0000-0000-000000000000').expect(401);
    await me(cookie).expect(200);
  });

  it('an old stateless HMAC cookie no longer works', async () => {
    const { createHmac } = await import('node:crypto');
    const admin = await prismaOf(app).admin.findFirstOrThrow();
    const body = Buffer.from(JSON.stringify({ sub: admin.id, iat: 0, exp: 9_999_999_999 })).toString('base64url');
    const mac = createHmac('sha256', 'test-session-secret').update(body).digest('base64url');
    await me(`hush_session=${body}.${mac}`).expect(401);
  });

  it('an expired session → 401, and it works again until it expires', async () => {
    const cookie = await adminCookie();
    const id = cookie.slice('hush_session='.length);
    await me(cookie).expect(200);
    await prismaOf(app).adminSession.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await me(cookie).expect(401);
  });

  it('a session whose admin lost the sub is 401', async () => {
    const cookie = await adminCookie();
    await prismaOf(app).admin.updateMany({ data: { idpSub: null } });
    await me(cookie).expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('needs a session', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
  });

  it('ends the session, clears the cookie and answers the idp end-session URL', async () => {
    const cookie = await adminCookie();
    const res = await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    const url = new URL(res.body.location);
    expect(url.origin).toBe(new URL(stub.issuer).origin);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${PUBLIC_URL}/signin`);
    const cleared = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cleared).toMatch(/^hush_session=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await prismaOf(app).adminSession.count()).toBe(0);
    await me(cookie).expect(401); // the old cookie is dead, not just cleared in the browser
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(401);
  });

  it('only ends the calling session', async () => {
    const a = await adminCookie();
    const b = await adminCookie();
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', a).expect(200);
    await me(b).expect(200);
  });

  it('the password login route is gone', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'anything' })
      .expect(404);
  });
});

describe('back-channel logout', () => {
  const deliver = (token: string) =>
    request(app.getHttpServer())
      .post('/api/auth/sso/backchannel-logout')
      .type('form')
      .send({ logout_token: token });
  const mint = async (over: Record<string, unknown> = {}, sid?: string) => {
    const admin = await prismaOf(app).admin.findFirstOrThrow({ include: { sessions: true } });
    return stub.mintLogoutToken({
      clientId: CLIENT_ID,
      sub: admin.idpSub!,
      sid: sid ?? admin.sessions[0]!.idpSid!,
      overrides: over,
    });
  };

  it('ends the session named by sid and leaves the others', async () => {
    const a = await adminCookie();
    const sidOfA = (await prismaOf(app).adminSession.findFirstOrThrow()).idpSid!;
    const b = await adminCookie();
    expect(sidOfA).toBeTruthy();
    await deliver(await mint({}, sidOfA)).expect(200);
    await me(a).expect(401);
    await me(b).expect(200);
    expect(await prismaOf(app).adminSession.count()).toBe(1);
  });

  it('answers 400 for a bad token and ends nothing', async () => {
    const cookie = await adminCookie();
    await deliver('not.a.jwt').expect(400);
    await deliver(await mint({ aud: 'someone-else' })).expect(400);
    await deliver(await mint({ nonce: 'n' })).expect(400);
    await deliver(await mint({ events: undefined })).expect(400);
    await request(app.getHttpServer()).post('/api/auth/sso/backchannel-logout').expect(400);
    await me(cookie).expect(200);
  });
});

describe('public and admin routes', () => {
  it('health, setup/status, device pairing and device config need no admin cookie', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    await request(app.getHttpServer()).get('/api/setup/status').expect(200);
    const pair = await request(app.getHttpServer()).post('/api/devices/pair').send({});
    expect(pair.status).toBe(400); // validation of the body, not the admin guard
    expect(pair.body.error).not.toBe('unauthenticated');
    const config = await request(app.getHttpServer()).get('/api/device/config');
    expect(config.status).toBe(401);
    expect(config.body.error).not.toBe('unauthenticated'); // the device token guard answered
  });

  it('hub/status needs the admin session', async () => {
    const res = await request(app.getHttpServer()).get('/api/hub/status').expect(401);
    expect(res.body.error).toBe('unauthenticated');
  });

  it('hub/status counts rows from the schema tables', async () => {
    const cookie = await adminCookie();
    const get = () => request(app.getHttpServer()).get('/api/hub/status').set('Cookie', cookie);
    expect((await get().expect(200)).body).toEqual({
      piholeConnected: false,
      profileCount: 0,
      deviceCount: 0,
    });
    await prismaOf(app).profile.create({ data: { name: 'Kids' } });
    expect((await get().expect(200)).body.profileCount).toBe(1);
  });
});

describe('loadConfig', () => {
  const prod = {
    NODE_ENV: 'production',
    ADMIN_EMAIL: 'a@b.co',
    SESSION_SECRET: 's',
    HUB_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    ISSUER_URL: 'https://id.example.test',
    CLIENT_ID: 'hush',
    CLIENT_SECRET: 'secret',
    PUBLIC_URL: 'https://hush.example.test/',
  };

  it('production refuses to start without each idp variable', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /ADMIN_EMAIL, SESSION_SECRET, ISSUER_URL, CLIENT_ID, CLIENT_SECRET, PUBLIC_URL/,
    );
    for (const key of ['ISSUER_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'PUBLIC_URL', 'SESSION_SECRET'] as const) {
      expect(() => loadConfig({ ...prod, [key]: '' })).toThrow(new RegExp(key));
    }
    expect(loadConfig(prod)).toMatchObject({ clientId: 'hush', publicUrl: 'https://hush.example.test' });
  });

  it('ADMIN_PASSWORD is neither required nor read', () => {
    expect(loadConfig(prod)).not.toHaveProperty('adminPassword');
  });

  it('outside production defaults to the stub, warns once, never prints a secret', () => {
    const warn = vi.fn();
    const c = loadConfig({}, warn);
    expect(c).toMatchObject({
      adminEmail: 'admin@hush.local',
      issuerUrl: 'http://127.0.0.1:3999',
      clientId: 'hush',
      hubName: 'Hush Hub',
      cookieSecure: false,
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toContain(c.clientSecret);
    expect(warn.mock.calls[0]![0]).toMatch(/ISSUER_URL/);
  });

  it('rejects a malformed ADMIN_EMAIL, ISSUER_URL or PUBLIC_URL', () => {
    expect(() => loadConfig({ ADMIN_EMAIL: 'nope' })).toThrow(/ADMIN_EMAIL/);
    expect(() => loadConfig({ ISSUER_URL: 'nope' })).toThrow(/ISSUER_URL/);
    expect(() => loadConfig({ PUBLIC_URL: 'nope' })).toThrow(/PUBLIC_URL/);
  });
});
