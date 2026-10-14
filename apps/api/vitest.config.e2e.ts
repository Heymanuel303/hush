import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // Specs share one database and truncate it, so files run one at a time.
    fileParallelism: false,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
