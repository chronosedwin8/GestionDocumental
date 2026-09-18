import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./lib/global-setup.ts'],
    include: ['tests/**/*.spec.ts'],
    // Las suites comparten una única base de datos y un único servidor:
    // se ejecutan en serie para que los conteos y los consecutivos sean deterministas.
    fileParallelism: false,
    sequence: {
      concurrent: false,
      // Orden alfabetico estable: las suites comparten datos y deben correr
      // siempre en la misma secuencia para ser reproducibles.
      sequencer: class {
        async shard(files: string[]) {
          return files;
        }
        async sort(files: [unknown, string][]) {
          return [...files].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
        }
      } as never,
    },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
});
