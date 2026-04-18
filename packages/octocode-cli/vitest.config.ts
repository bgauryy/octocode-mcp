import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types/**',
        'src/cli/types.ts', // Type-only file (interfaces, no runtime code)
        'src/ui/**', // Interactive UI components - tested manually
        'src/prompts.ts', // Dynamic import wrapper
        'src/spinner.ts', // Visual feedback component
        'src/cli/commands.ts', // Barrel re-export
        'src/cli/help.ts', // Help text output
        'src/cli/index.ts', // CLI entry point
        'src/configs/**', // Static config objects
        'src/features/github-oauth.ts', // OAuth flow - requires network mocking
        'src/utils/token-storage.ts', // Pure re-export from octocode-shared
      ],
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 95,
        lines: 95,
      },
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    restoreMocks: true,
    clearMocks: true,
  },
});
