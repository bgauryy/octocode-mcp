import { beforeEach, afterAll, vi } from 'vitest';
import { initializeToolMetadata } from '../src/tools/toolMetadata';
import content from '../src/tools/content.json';

// Mock global fetch for metadata loading - MUST be done before any imports that use metadata
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => content,
});

// Initialize tool metadata for all tests - using top-level await to ensure it runs before test file imports
await initializeToolMetadata();

// Mock console methods to avoid noise during tests
beforeEach(() => {
  // Only mock if not in debug mode
  if (!process.env.VITEST_DEBUG) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Global test environment setup
process.env.NODE_ENV = 'test';
process.env.VITEST_TEST_MODE = '1';

// Suppress expected unhandled errors from process.exit() mocking in index tests
// These are expected behavior when testing process termination scenarios
const originalUnhandledRejection = process.listeners('unhandledRejection');
const originalUncaughtException = process.listeners('uncaughtException');

process.removeAllListeners('unhandledRejection');
process.removeAllListeners('uncaughtException');

process.on('unhandledRejection', (reason, promise) => {
  // Only suppress errors that are from our process.exit mocking
  if (
    reason instanceof Error &&
    reason.message.includes('process.exit called with code')
  ) {
    // This is expected from our index.test.ts process.exit mocking - ignore it
    return;
  }

  // Suppress expected unhandled rejections from promiseUtils test mocks
  if (
    reason instanceof Error &&
    (reason.message.includes('always fails') ||
      reason.message.includes('non-retryable error') ||
      reason.message.includes('retryable error'))
  ) {
    // These are expected from promiseUtils.test.ts retry testing - ignore them
    return;
  }

  // For any other unhandled rejections, call the original handlers
  originalUnhandledRejection.forEach(handler => {
    if (typeof handler === 'function') {
      handler(reason, promise);
    }
  });
});

process.on('uncaughtException', error => {
  // Only suppress errors that are from our process.exit mocking
  if (error.message.includes('process.exit called with code')) {
    // This is expected from our index.test.ts process.exit mocking - ignore it
    return;
  }

  // For any other uncaught exceptions, call the original handlers
  originalUncaughtException.forEach(handler => {
    if (typeof handler === 'function') {
      handler(error, 'uncaughtException');
    }
  });
});
