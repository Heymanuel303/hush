import type { INestApplication } from '@nestjs/common';
import { BUILT_IN_PACKS } from 'contracts';
import { createTestApp, prismaOf, resetDb } from './db.js';

describe('schema and built-in packs', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(prismaOf(app));
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedAgain() {
    await app.get((await import('../src/packs/packs.seed.js')).PacksSeed).onApplicationBootstrap();
  }

  it('seeds the built-in packs after bootstrap, idempotently', async () => {
    const prisma = prismaOf(app);
    await seedAgain();
    await seedAgain();
    const packs = await prisma.pack.findMany();
    expect(packs).toHaveLength(BUILT_IN_PACKS.length);
    expect(packs.every((p) => p.builtIn)).toBe(true);
  });

  it('survives concurrent seeding and leaves household packs alone', async () => {
    const prisma = prismaOf(app);
    await prisma.pack.create({ data: { name: 'Mine', words: ['x'] } });
    await Promise.all([seedAgain(), seedAgain()]);
    expect(await prisma.pack.count()).toBe(BUILT_IN_PACKS.length + 1);
    expect((await prisma.pack.findUniqueOrThrow({ where: { name: 'Mine' } })).builtIn).toBe(false);
  });

  it('has AdminSession and Admin.idpSub, with a unique sub and cascading sessions', async () => {
    const prisma = prismaOf(app);
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('Admin', 'AdminSession')`;
    const has = (t: string, c: string) => columns.some((x) => x.table_name === t && x.column_name === c);
    expect(has('Admin', 'idpSub')).toBe(true);
    for (const c of ['id', 'adminId', 'idpSid', 'refreshTokenSealed', 'accessExpiresAt', 'refreshLockedUntil', 'expiresAt', 'createdAt']) {
      expect(has('AdminSession', c)).toBe(true);
    }
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'AdminSession'`;
    expect(indexes.map((i) => i.indexname)).toContain('AdminSession_idpSid_idx');

    await prisma.admin.create({ data: { email: 'a@example.com', idpSub: 's' } });
    await expect(
      prisma.admin.create({ data: { email: 'b@example.com', idpSub: 's' } }),
    ).rejects.toThrow();
    const admin = await prisma.admin.findUniqueOrThrow({ where: { email: 'a@example.com' } });
    await prisma.adminSession.create({ data: { id: 'x', adminId: admin.id, expiresAt: new Date() } });
    await prisma.admin.delete({ where: { id: admin.id } });
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it('restricts deleting a profile with a device, cascades rules and pairing codes', async () => {
    const prisma = prismaOf(app);
    const profile = await prisma.profile.create({
      data: { name: 'Kid', rules: { create: { blockWords: [], enabledPacks: [], siteWords: {}, siteOptions: {} } } },
    });
    await prisma.pairingCode.create({
      data: { code: 'ABCDEF', profileId: profile.id, expiresAt: new Date(Date.now() + 600_000) },
    });
    const device = await prisma.device.create({
      data: { profileId: profile.id, label: 'Laptop', tokenHash: 'hash' },
    });
    await expect(prisma.profile.delete({ where: { id: profile.id } })).rejects.toThrow();

    await prisma.device.delete({ where: { id: device.id } });
    await prisma.profile.delete({ where: { id: profile.id } });
    expect(await prisma.ruleSet.count()).toBe(0);
    expect(await prisma.pairingCode.count()).toBe(0);
  });
});
