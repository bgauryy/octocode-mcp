import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Setup file for global test configuration
    // Note: Each test file handles its own mocks for storage isolation
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      // Lower thresholds - comprehensive tests are in octocode-cli which imports from this package
      thresholds: {
        statements: 35,
        branches: 20,
        functions: 40,
        lines: 35,
      },
    },
  },
});
