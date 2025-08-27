// Test setup file for octocode-local-server
import { beforeEach, vi } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables for tests
dotenv.config({ path: '.env.test' });

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Set test timeout
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 30000,
});
