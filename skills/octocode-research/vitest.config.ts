import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __PACKAGE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/types/**'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
