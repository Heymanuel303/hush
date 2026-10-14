import type { INestApplication } from '@nestjs/common';
import { ErrorBody } from 'contracts';
import request from 'supertest';
import { AdminService } from '../src/auth/admin.service.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '../src/auth/session.js';
import { loadConfig } from '../src/config/config.js';
import { createTestApp, prismaOf, resetDb } from './db.js';

const SECRET = 'test-session-secret';
const EMAIL = 'parent@example.test';
const PASSWORD = 'correct horse battery';
const saved = { ...process.env };

function setEnv(extra: Record<string, string | undefined> = {}): void {
  process.env = {
    ...saved,
    ADMIN_EMAIL: EMAIL,
    ADMIN_PASSWORD: PASSWORD,
    SESSION_SECRET: SECRET,
    COOKIE_SECURE: 'false',
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

let app: INestApplication;
const login = (email = EMAIL, password = PASSWORD, ip = '10.0.0.1') =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
const cookieOf = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[])[0]!;

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

  it('creates the admin from env, hashed, and reports it configured', async () => {
    const rows = await prismaOf(app).admin.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe(EMAIL);
    expect(rows[0]!.passwordHash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(rows[0]!.passwordHash).not.toContain(PASSWORD);
    const res = await request(app.getHttpServer()).get('/api/setup/status').expect(200);
    expect(res.body).toEqual({ adminConfigured: true });
  });

  it('re-hashes on a changed ADMIN_PASSWORD and the old one stops working', async () => {
    const before = (await prismaOf(app).admin.findFirstOrThrow()).passwordHash;
    await app.close();
    setEnv({ ADMIN_PASSWORD: 'a brand new password' });
    app = await createTestApp();
    const after = (await prismaOf(app).admin.findFirstOrThrow()).passwordHash;
    expect(after).not.toBe(before);
    await login(EMAIL, PASSWORD).expect(401);
    await login(EMAIL, 'a brand new password').expect(200);
  });

  it('keeps the hash when env is unchanged and updates a changed email in place', async () => {
    const before = await prismaOf(app).admin.findFirstOrThrow();
    await app.close();
    setEnv({ ADMIN_EMAIL: 'other@example.test' });
    app = await createTestApp();
    const rows = await prismaOf(app).admin.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(before.id);
    expect(rows[0]!.email).toBe('other@example.test');
    expect(rows[0]!.passwordHash).toBe(before.passwordHash);
    await login('other@example.test').expect(200);
    await login(EMAIL).expect(401);
  });
});

describe('POST /api/auth/login', () => {
  it('sets an HttpOnly SameSite=Lax cookie and me returns the email', async () => {
    const res = await login().expect(200);
    expect(res.body).toEqual({ email: EMAIL });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).toMatch(/Expires=/);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie.split(';')[0]!)
      .expect(200);
    expect(me.body).toEqual({ email: EMAIL });
  });

  it('never returns the password or the hash', async () => {
    const res = await login().expect(200);
    const hash = (await prismaOf(app).admin.findFirstOrThrow()).passwordHash;
    const dump = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain(hash);
  });

  it('wrong password and unknown email both give 401 in the ErrorBody shape', async () => {
    for (const res of [await login(EMAIL, 'nope').expect(401), await login('x@example.test').expect(401)]) {
      expect(res.body.error).toBe('invalid_credentials');
      expect(ErrorBody.safeParse(res.body).success).toBe(true);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('rejects a malformed body with 400 validation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
    expect(res.body.error).toBe('validation');
  });

  it('Secure follows COOKIE_SECURE', async () => {
    await app.close();
    setEnv({ COOKIE_SECURE: 'true' });
    app = await createTestApp();
    const res = await login().expect(200);
    expect(cookieOf(res)).toMatch(/Secure/i);
  });

  it('rate limits: the eleventh attempt in a minute is 429, per client IP', async () => {
    for (let i = 0; i < 10; i++) await login(EMAIL, 'bad', '10.9.9.9').expect(401);
    const res = await login(EMAIL, 'bad', '10.9.9.9').expect(429);
    expect(res.body.error).toBe('too_many_attempts');
    expect(ErrorBody.safeParse(res.body).success).toBe(true);
    // even the right password is refused while limited
    await login(EMAIL, PASSWORD, '10.9.9.9').expect(429);
    // another client is unaffected
    await login(EMAIL, PASSWORD, '10.8.8.8').expect(200);
  });

  it('buckets by the first X-Forwarded-For entry, not the shared proxy hop', async () => {
    for (let i = 0; i < 10; i++) await login(EMAIL, 'bad', '1.1.1.1, 10.7.7.7').expect(401);
    await login(EMAIL, 'bad', '1.1.1.1, 10.7.7.7').expect(429);
    // another client behind the same proxy has its own bucket
    await login(EMAIL, PASSWORD, '2.2.2.2, 10.7.7.7').expect(200);
  });
});

describe('session cookie', () => {
  const me = (cookie?: string) => {
    const r = request(app.getHttpServer()).get('/api/auth/me');
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const adminId = async () => (await prismaOf(app).admin.findFirstOrThrow()).id;

  it('no cookie → 401 unauthenticated', async () => {
    const res = await me().expect(401);
    expect(res.body.error).toBe('unauthenticated');
    expect(ErrorBody.safeParse(res.body).success).toBe(true);
  });

  it('tampered payload or signature → 401', async () => {
    const token = signSession(await adminId(), SECRET);
    const [body, mac] = token.split('.') as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ sub: await adminId(), iat: 0, exp: 9_999_999_999 }),
    ).toString('base64url');
    await me(`${SESSION_COOKIE}=${forged}.${mac}`).expect(401);
    await me(`${SESSION_COOKIE}=${body}.${mac.slice(0, -2)}AA`).expect(401);
    await me(`${SESSION_COOKIE}=${body}`).expect(401);
    await me(`${SESSION_COOKIE}=garbage`).expect(401);
  });

  it('signed with another secret → 401', async () => {
    await me(`${SESSION_COOKIE}=${signSession(await adminId(), 'other-secret')}`).expect(401);
  });

  it('expired → 401, still valid just before expiry', async () => {
    const id = await adminId();
    const eightDaysAgo = Date.now() - (SESSION_TTL_SECONDS + 86_400) * 1000;
    await me(`${SESSION_COOKIE}=${signSession(id, SECRET, eightDaysAgo)}`).expect(401);
    const sixDaysAgo = Date.now() - 6 * 86_400 * 1000;
    await me(`${SESSION_COOKIE}=${signSession(id, SECRET, sixDaysAgo)}`).expect(200);
  });

  it('a valid signature for an unknown admin id → 401', async () => {
    const ghost = signSession('00000000-0000-0000-0000-000000000000', SECRET);
    await me(`${SESSION_COOKIE}=${ghost}`).expect(401);
  });

  it('logout clears the cookie and needs a session', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    const cookie = cookieOf(await login().expect(200)).split(';')[0]!;
    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(cookieOf(res)).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('public and admin routes', () => {
  it('setup/status and health need no cookie; hub/status does', async () => {
    await request(app.getHttpServer()).get('/api/setup/status').expect(200);
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    const res = await request(app.getHttpServer()).get('/api/hub/status').expect(401);
    expect(res.body.error).toBe('unauthenticated');
  });

  it('hub/status counts rows from the schema tables', async () => {
    const cookie = cookieOf(await login().expect(200)).split(';')[0]!;
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

describe('password hashing', () => {
  it('verifies, rejects wrong and malformed hashes', async () => {
    const h = await hashPassword('pw');
    expect(await verifyPassword('pw', h)).toBe(true);
    expect(await verifyPassword('pw2', h)).toBe(false);
    expect(await verifyPassword('pw', 'garbage')).toBe(false);
    expect(await verifyPassword('pw', 'scrypt$x$8$1$aa$bb')).toBe(false);
  });
});

describe('loadConfig', () => {
  it('production refuses to start without the admin values and secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET/,
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'production', ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'x', SESSION_SECRET: '' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('outside production defaults, warns, and defaults HUB_NAME', () => {
    const warn = vi.fn();
    const c = loadConfig({}, warn);
    expect(c).toMatchObject({
      adminEmail: 'admin@hush.local',
      adminPassword: 'hush-dev-password',
      hubName: 'Hush Hub',
      cookieSecure: false,
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toContain('hush-dev-password');
  });

  it('rejects a malformed ADMIN_EMAIL', () => {
    expect(() => loadConfig({ ADMIN_EMAIL: 'nope' })).toThrow(/ADMIN_EMAIL/);
  });
});
