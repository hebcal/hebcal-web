import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.cjs'],
      reportOnFailure: true,
    },
  },
});
