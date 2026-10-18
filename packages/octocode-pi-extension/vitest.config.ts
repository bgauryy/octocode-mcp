import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // These bounds only decide when a hung test is reported: a passing test returns as soon as it is done. Vitest's 5 s
    // default sits below the work of the suites that start git, node or Chrome children (worktree, checkpoint, mcp, team),
    // which takes several seconds when a parallel run or other agents keep the machine at a load average far above its
    // core count. A test that needs more sets its own bound, scaled to its work.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Floors just under the measured level (2026-10-14: 95.53 / 89.21 / 96.15 / 97.70); raise them as coverage grows, never lower them.
    coverage: { include: ['src/**/*.ts'], thresholds: { statements: 95.4, branches: 89, functions: 96.1, lines: 97.6 } },
  },
});
