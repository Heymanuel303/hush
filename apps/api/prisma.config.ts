import { defineConfig } from 'prisma/config';

// DATABASE_URL is read from the environment (`.env` is not loaded automatically by Prisma 7).
// `prisma generate` needs no database, so an unset URL only fails the commands that connect.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
