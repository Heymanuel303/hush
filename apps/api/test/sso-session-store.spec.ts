import type { INestApplication } from '@nestjs/common';
import { PrismaSessionStore } from '../src/auth/sso/prisma-session.store.js';
import { createTestApp, prismaOf, resetDb } from './db.js';

describe('PrismaSessionStore', () => {
  let app: INestApplication;
  let store: PrismaSessionStore;
  const now = new Date('2026-10-26T10:00:00Z');
  const input = (over: Partial<{ idpSid: string | null; accessExpiresAt: Date }> = {}) => ({
    sub: 'sub-1',
    idpSid: 'sid-1',
    accessExpiresAt: new Date(now.getTime() - 1000),
    refreshTokenSealed: 'sealed',
    ...over,
  });

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(prismaOf(app));
    await prismaOf(app).admin.create({ data: { email: 'admin@example.com', passwordHash: 'x', idpSub: 'sub-1' } });
    store = app.get(PrismaSessionStore);
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a random 32-byte base64url id with a 7-day expiry and finds it with the sub', async () => {
    const a = await store.create(input());
    const b = await store.create(input());
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.sub).toBe('sub-1');
    const row = await prismaOf(app).adminSession.findUniqueOrThrow({ where: { id: a.id } });
    const ttl = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(ttl - 7 * 86_400_000)).toBeLessThan(5000);
    expect(await store.find(a.id)).toMatchObject({ id: a.id, sub: 'sub-1', idpSid: 'sid-1', refreshTokenSealed: 'sealed' });
  });

  it('refuses to create a session for an unlinked sub, and does not find an unknown or expired one', async () => {
    await expect(store.create({ ...input(), sub: 'nobody' })).rejects.toThrow();
    expect(await store.find('missing')).toBeNull();
    const s = await store.create(input());
    await prismaOf(app).adminSession.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await store.find(s.id)).toBeNull();
  });

  it('lockRefresh claims once while the access token is expired and releases on completion', async () => {
    const s = await store.create(input());
    const wins = await Promise.all(Array.from({ length: 5 }, () => store.lockRefresh(s.id, now, 30_000)));
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await store.lockRefresh(s.id, new Date(now.getTime() + 10_000), 30_000)).toBe(false);
    expect(await store.lockRefresh(s.id, new Date(now.getTime() + 31_000), 30_000)).toBe(true);

    const fresh = new Date(now.getTime() + 600_000);
    await store.completeRefresh(s.id, { refreshTokenSealed: 'rotated', accessExpiresAt: fresh });
    expect(await store.find(s.id)).toMatchObject({ refreshTokenSealed: 'rotated', accessExpiresAt: fresh });
    // Access token still valid: nothing to claim.
    expect(await store.lockRefresh(s.id, now, 30_000)).toBe(false);
  });

  it('lockRefresh is false for an unknown session', async () => {
    expect(await store.lockRefresh('missing', now, 30_000)).toBe(false);
  });

  it('endByIdpSid ends every session with that sid', async () => {
    const a = await store.create(input());
    const b = await store.create(input());
    const other = await store.create(input({ idpSid: 'sid-2' }));
    expect(await store.endByIdpSid('sid-1')).toBe(2);
    expect(await store.find(a.id)).toBeNull();
    expect(await store.find(b.id)).toBeNull();
    expect(await store.find(other.id)).not.toBeNull();
    expect(await store.endByIdpSid('sid-1')).toBe(0);
  });

  it('endAllForSub ends every session of that sub only, and end removes one', async () => {
    const a = await store.create(input());
    const b = await store.create(input({ idpSid: null }));
    await store.end(a.id);
    expect(await store.find(a.id)).toBeNull();
    expect(await store.find(b.id)).not.toBeNull();
    expect(await store.endAllForSub('sub-other')).toBe(0);
    expect(await store.endAllForSub('sub-1')).toBe(1);
    expect(await store.find(b.id)).toBeNull();
  });
});
