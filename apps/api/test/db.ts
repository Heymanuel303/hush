/**
 * API test harness. Tests run against a real PostgreSQL:
 *
 *   aib-start-postgres hush        # prints DATABASE_URL=...
 *   export DATABASE_URL=postgres://postgres@localhost:5432/hush
 *
 * `pnpm test` runs `prisma migrate deploy` itself when DATABASE_URL is set.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { PrismaService as Prisma } from '../src/prisma/prisma.service.js';

/** The app as main.ts builds it: global prefix and shutdown hooks (Zod pipes are per-route). */
export async function createTestApp(
  override?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  override?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.init();
  return app;
}

/** Empties every table so each spec starts clean (built-in packs return on the next boot). */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export const prismaOf = (app: INestApplication): PrismaService => app.get(Prisma);
