/**
 * Keychain Tests for octocode-shared
 *
 * Tests for native keychain access using @napi-rs/keyring.
 * We mock the @napi-rs/keyring module to test our wrapper functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock functions that persist across module reloads
const mockSetPassword = vi.fn();
const mockGetPassword = vi.fn();
const mockDeleteCredential = vi.fn();
const mockFindCredentialsAsync = vi.fn();

// Mock @napi-rs/keyring with a proper class
vi.mock('@napi-rs/keyring', () => {
  // Create a mock class that can be instantiated with 'new'
  class MockAsyncEntry {
    service: string;
    account: string;

    constructor(service: string, account: string) {
      this.service = service;
      this.account = account;
    }

    setPassword(password: string) {
      return mockSetPassword(password);
    }

    getPassword() {
      return mockGetPassword();
    }

    deleteCredential() {
      return mockDeleteCredential();
    }
  }

  return {
    AsyncEntry: MockAsyncEntry,
    findCredentialsAsync: mockFindCredentialsAsync,
  };
});

describe('Keychain', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSetPassword.mockReset();
    mockGetPassword.mockReset();
    mockDeleteCredential.mockReset();
    mockFindCredentialsAsync.mockReset();
  });

  // ==========================================================================
  // isKeychainAvailable tests
  // ==========================================================================
  describe('isKeychainAvailable', () => {
    it('should return true since @napi-rs/keyring has prebuilt binaries', async () => {
      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(true);
    });
  });

  // ==========================================================================
  // setPassword tests
  // ==========================================================================
  describe('setPassword', () => {
    it('should store password successfully', async () => {
      mockSetPassword.mockResolvedValue(undefined);

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).resolves.toBeUndefined();

      expect(mockSetPassword).toHaveBeenCalledWith('test-password');
    });

    it('should throw error when setPassword fails', async () => {
      mockSetPassword.mockRejectedValue(new Error('Keychain error'));

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).rejects.toThrow('Keychain error');
    });
  });

  // ==========================================================================
  // getPassword tests
  // ==========================================================================
  describe('getPassword', () => {
    it('should return password when found', async () => {
      mockGetPassword.mockResolvedValue('my-secret-password');

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');

      expect(result).toBe('my-secret-password');
    });

    it('should return null when password not found (undefined)', async () => {
      mockGetPassword.mockResolvedValue(undefined);

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');

      expect(result).toBeNull();
    });

    it('should return null when getPassword throws error', async () => {
      mockGetPassword.mockRejectedValue(new Error('Not found'));

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // deletePassword tests
  // ==========================================================================
  describe('deletePassword', () => {
    it('should return true when deleted successfully', async () => {
      mockDeleteCredential.mockResolvedValue(true);

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');

      expect(result).toBe(true);
    });

    it('should return false when credential not found', async () => {
      mockDeleteCredential.mockResolvedValue(false);

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');

      expect(result).toBe(false);
    });

    it('should return false when deleteCredential throws error', async () => {
      mockDeleteCredential.mockRejectedValue(new Error('Delete failed'));

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // findCredentials tests
  // ==========================================================================
  describe('findCredentials', () => {
    it('should return credentials when found', async () => {
      const mockCredentials = [
        { account: 'account1', password: 'password1' },
        { account: 'account2', password: 'password2' },
      ];
      mockFindCredentialsAsync.mockResolvedValue(mockCredentials);

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      expect(result).toEqual(mockCredentials);
      expect(mockFindCredentialsAsync).toHaveBeenCalledWith('test-service');
    });

    it('should return empty array when no credentials found', async () => {
      mockFindCredentialsAsync.mockResolvedValue([]);

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      expect(result).toEqual([]);
    });

    it('should return empty array when findCredentialsAsync throws error', async () => {
      mockFindCredentialsAsync.mockRejectedValue(new Error('Search failed'));

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      expect(result).toEqual([]);
    });
  });
});
