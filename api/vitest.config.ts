import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersProject({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          d1Databases: ['DB'],
          // Read migrations from disk and provide them as the `__D1_MIGRATIONS`
          // binding so tests can apply them via `applyD1Migrations(env.DB, ...)`.
          bindings: { __D1_MIGRATIONS: await readD1Migrations('migrations') },
        },
      },
    },
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
