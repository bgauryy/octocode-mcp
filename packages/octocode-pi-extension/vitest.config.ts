import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // Floors at the measured level (2026-10-11: 95.02 / 88.6 / 96.12 / 97.24); raise them as coverage grows, never lower them.
    coverage: { include: ['src/**/*.ts'], thresholds: { statements: 95, branches: 88.5, functions: 96, lines: 97 } },
  },
});
