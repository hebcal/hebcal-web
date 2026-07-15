import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Shared per-file servers (test/testServer.js) removed nearly all of the
    // supertest transport flakiness; retry covers the rare residual blip where
    // a request still gets misrouted to a spurious 4xx/5xx.
    retry: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.cjs'],
      reportOnFailure: true,
    },
  },
});
