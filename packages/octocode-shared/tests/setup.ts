/**
 * Vitest Setup File for octocode-shared
 *
 * Global mocks to prevent tests from accessing real system resources.
 * This file runs before all tests to ensure isolation.
 *
 * SAFETY: Keychain is globally mocked to prevent tests from accidentally
 * writing to the real system keychain. Individual test files can override
 * these mocks with their own vi.mock() calls if needed.
 */

import { vi } from 'vitest';

// Global keychain mock - SAFETY NET to prevent real keychain access
// This prevents tests from accidentally writing test data (e.g., 'testuser')
// to your real system keychain, which would then appear when running the CLI.
//
// Individual test files (like keychain.test.ts) can override with their own mocks.
vi.mock('../src/credentials/keychain.js', () => ({
  isKeychainAvailable: vi.fn().mockReturnValue(false),
  setPassword: vi.fn().mockResolvedValue(undefined),
  getPassword: vi.fn().mockResolvedValue(null),
  deletePassword: vi.fn().mockResolvedValue(false),
  findCredentials: vi.fn().mockResolvedValue([]),
  findCredentialsAsync: vi.fn().mockResolvedValue([]),
}));
