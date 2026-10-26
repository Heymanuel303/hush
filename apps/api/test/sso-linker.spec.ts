import type { INestApplication } from '@nestjs/common';
import { LinkError } from '@heymanuel303/idp-client/nest';
import { AdminLinker } from '../src/auth/sso/admin-linker.service.js';
import { createTestApp, prismaOf, resetDb } from './db.js';

describe('AdminLinker', () => {
  let app: INestApplication;
  let linker: AdminLinker;
  const email = 'admin@example.com';

  const admin = () => prismaOf(app).admin.findFirstOrThrow();
  const claims = (over: Partial<{ sub: string; email: string | null; emailVerified: boolean }> = {}) => ({
    sub: 'sub-1',
    email,
    emailVerified: true,
    ...over,
  });
  const refused = async (p: Promise<unknown>) => {
    const error = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LinkError);
    expect((error as LinkError).code).toBe('not_an_admin');
  };

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(prismaOf(app));
    await prismaOf(app).admin.create({ data: { email, passwordHash: 'x' } });
    linker = app.get(AdminLinker);
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts the stored sub', async () => {
    await prismaOf(app).admin.updateMany({ data: { idpSub: 'sub-1' } });
    const linked = await linker.linkOrCreate(claims({ email: null, emailVerified: false }));
    expect(linked.id).toBe((await admin()).id);
  });

  it('stores the sub on the first sign-in by verified email', async () => {
    const linked = await linker.linkOrCreate(claims({ email: 'Admin@Example.com' }));
    expect(linked).toEqual({ id: (await admin()).id, email });
    expect((await admin()).idpSub).toBe('sub-1');
    await expect(linker.linkOrCreate(claims({ email: null }))).resolves.toMatchObject({ email });
  });

  it('refuses a different sub with the same email once a sub is stored', async () => {
    await linker.linkOrCreate(claims());
    await refused(linker.linkOrCreate(claims({ sub: 'sub-2' })));
    expect((await admin()).idpSub).toBe('sub-1');
  });

  it('refuses an unverified email and stores nothing', async () => {
    await refused(linker.linkOrCreate(claims({ emailVerified: false })));
    expect((await admin()).idpSub).toBeNull();
  });

  it('refuses an unknown email and a missing email', async () => {
    await refused(linker.linkOrCreate(claims({ email: 'other@example.com' })));
    await refused(linker.linkOrCreate(claims({ email: null })));
    expect((await admin()).idpSub).toBeNull();
  });

  it('lets only one of two concurrent first sign-ins claim the row', async () => {
    const results = await Promise.allSettled([
      linker.linkOrCreate(claims({ sub: 'a' })),
      linker.linkOrCreate(claims({ sub: 'b' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(['a', 'b']).toContain((await admin()).idpSub);
  });

  it('never creates an Admin row', async () => {
    const prisma = prismaOf(app);
    await prisma.admin.deleteMany();
    await refused(linker.linkOrCreate(claims()));
    await refused(linker.linkOrCreate(claims({ sub: 'sub-9', email: 'new@example.com' })));
    expect(await prisma.admin.count()).toBe(0);
    // With one admin present, refused sign-ins leave the count at one.
    await prisma.admin.create({ data: { email, passwordHash: 'x' } });
    await refused(linker.linkOrCreate(claims({ email: 'new@example.com' })));
    expect(await prisma.admin.count()).toBe(1);
  });
});
