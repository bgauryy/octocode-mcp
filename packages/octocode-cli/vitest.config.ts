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
        'src/ui/**', // Interactive UI components - tested manually
        'src/prompts.ts', // Dynamic import wrapper
        'src/spinner.ts', // Visual feedback component
        'src/cli/commands.ts', // Command handlers - integration tests
        'src/cli/help.ts', // Help text output
        'src/cli/index.ts', // CLI entry point
        'src/configs/**', // Static config objects
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    restoreMocks: true,
    clearMocks: true,
  },
});

