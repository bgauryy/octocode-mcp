import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 2000, // 2 seconds per test
    hookTimeout: 1000, // 1 second for hooks
    teardownTimeout: 1000, // 1 second for teardown
    dangerouslyIgnoreUnhandledErrors: true, // Ignore unhandled errors from test mocks
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.context/**', // Exclude .context directory with unrelated code
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts', // Main entry point with process handlers - hard to test
        'src/types.ts', // Type definitions only
        'src/**/*.d.ts', // Type definition files
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
  plugins: [
    {
      name: 'markdown-loader',
      transform(code, id) {
        if (id.endsWith('.md')) {
          // Read markdown file and export as string (same as rollup-plugin-string)
          const content = readFileSync(id, 'utf-8');
          return {
            code: `export default ${JSON.stringify(content)};`,
            map: null,
          };
        }
      },
    },
  ],
});
