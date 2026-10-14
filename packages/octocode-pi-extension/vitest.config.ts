import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // Floors just under the measured level (2026-10-14: 95.53 / 89.21 / 96.15 / 97.70); raise them as coverage grows, never lower them.
    coverage: { include: ['src/**/*.ts'], thresholds: { statements: 95.4, branches: 89, functions: 96.1, lines: 97.6 } },
  },
});
