import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Las pruebas comparten la base eduarchive_test: se ejecutan en serie.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      ENABLE_JOBS: 'false',
      LOG_LEVEL: 'silent',
    },
  },
});
