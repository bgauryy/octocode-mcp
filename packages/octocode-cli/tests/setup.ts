/**
 * Vitest Test Setup
 */

import { vi, beforeEach } from 'vitest';

// Mock process.exit to prevent tests from exiting
vi.spyOn(process, 'exit').mockImplementation(code => {
  throw new Error(`process.exit(${code})`);
});

// CRITICAL: Mock @napi-rs/keyring to prevent tests from writing to real keychain
// This is the native module that provides keychain access
vi.mock('@napi-rs/keyring', () => {
  class MockAsyncEntry {
    service: string;
    account: string;
    constructor(service: string, account: string) {
      this.service = service;
      this.account = account;
    }
    setPassword(_password: string) {
      return Promise.resolve();
    }
    getPassword() {
      return Promise.resolve(undefined);
    }
    deleteCredential() {
      return Promise.resolve(false);
    }
  }
  return {
    AsyncEntry: MockAsyncEntry,
    findCredentialsAsync: vi.fn().mockResolvedValue([]),
  };
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
