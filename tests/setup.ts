import { beforeEach, vi } from 'vitest';

// Mock console methods to avoid noise during tests
beforeEach(() => {
  // Only mock if not in debug mode
  if (!process.env.VITEST_DEBUG) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }
});

// Global test environment setup
process.env.NODE_ENV = 'test';
process.env.VITEST_TEST_MODE = '1';
