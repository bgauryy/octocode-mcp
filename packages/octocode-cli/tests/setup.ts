/**
 * Vitest Test Setup
 */

import { vi } from 'vitest';

// Mock process.exit to prevent tests from exiting
vi.spyOn(process, 'exit').mockImplementation(code => {
  throw new Error(`process.exit(${code})`);
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
