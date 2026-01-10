/**
 * Vitest Setup File for octocode-shared
 *
 * Global mocks to prevent tests from accessing real system resources.
 * This file runs before all tests to ensure isolation.
 *
 * IMPORTANT: Each test file should explicitly mock keychain.js if needed.
 * We do NOT globally mock keychain.js here because:
 * - keychain.test.ts needs to test the real keychain.js wrapper
 * - Other test files (like storage.test.ts) should mock it explicitly
 *
 * This setup file only provides safety nets for truly dangerous operations.
 */

// This file intentionally empty for now.
// Each test file is responsible for its own mocks.
//
// If you're adding a new test file that uses storage.ts, add this mock:
//
// vi.mock('../../src/credentials/keychain.js', () => ({
//   isKeychainAvailable: vi.fn().mockReturnValue(false),
//   setPassword: vi.fn().mockResolvedValue(undefined),
//   getPassword: vi.fn().mockResolvedValue(null),
//   deletePassword: vi.fn().mockResolvedValue(false),
//   findCredentials: vi.fn().mockResolvedValue([]),
// }));
