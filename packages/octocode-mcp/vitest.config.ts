import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 2000, // 2 seconds per test
    hookTimeout: 1000, // 1 second for hooks
    teardownTimeout: 1000, // 1 second for teardown
    dangerouslyIgnoreUnhandledErrors: true, // Ignore unhandled errors from test mocks
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});
