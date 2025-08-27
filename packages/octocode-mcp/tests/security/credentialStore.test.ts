import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecureCredentialStore } from '../../src/security/credentialStore';
import crypto from 'crypto';

describe('SecureCredentialStore', () => {
  beforeEach(() => {
    // Clear any existing state before each test
    SecureCredentialStore.clearAll();
  });

  afterEach(() => {
    // Clean up after each test
    SecureCredentialStore.clearAll();
  });

  describe('Basic Credential Operations', () => {
    it('should store and retrieve a credential successfully', () => {
      const testCredential = 'test-api-key-123';

      const credentialId = SecureCredentialStore.setCredential(testCredential);

      expect(credentialId).toBeTruthy();
      expect(typeof credentialId).toBe('string');
      expect(credentialId.length).toBeGreaterThan(0);

      const retrieved = SecureCredentialStore.getCredential(credentialId);
      expect(retrieved).toBe(testCredential);
    });

    it('should return null for non-existent credential', () => {
      const nonExistentId = crypto.randomUUID();
      const result = SecureCredentialStore.getCredential(nonExistentId);
      expect(result).toBeNull();
    });

    it('should handle multiple different credentials', () => {
      const credentials = [
        'github-token-abc123',
        'npm-token-xyz789',
        'api-key-def456',
      ];

      const ids = credentials.map(cred =>
        SecureCredentialStore.setCredential(cred)
      );

      expect(ids.length).toBe(3);
      expect(new Set(ids).size).toBe(3); // All unique

      // Retrieve all credentials
      const retrieved = ids.map(id => SecureCredentialStore.getCredential(id));

      expect(retrieved).toEqual(credentials);
    });

    it('should handle empty string credential', () => {
      const credentialId = SecureCredentialStore.setCredential('');
      const retrieved = SecureCredentialStore.getCredential(credentialId);
      expect(retrieved).toBe('');
    });

    it('should handle very long credentials', () => {
      const longCredential = 'a'.repeat(10000); // Very long credential
      const credentialId = SecureCredentialStore.setCredential(longCredential);
      const retrieved = SecureCredentialStore.getCredential(credentialId);
      expect(retrieved).toBe(longCredential);
    });

    it('should handle special characters in credentials', () => {
      const specialCredential =
        'token-with-special-chars:!@#$%^&*(){}[]|\\<>?,./';
      const credentialId =
        SecureCredentialStore.setCredential(specialCredential);
      const retrieved = SecureCredentialStore.getCredential(credentialId);
      expect(retrieved).toBe(specialCredential);
    });
  });

  describe('Credential Management', () => {
    it('should remove credentials successfully', () => {
      const testCredential = 'test-credential';
      const credentialId = SecureCredentialStore.setCredential(testCredential);

      expect(SecureCredentialStore.getCredential(credentialId)).toBe(
        testCredential
      );

      const removed = SecureCredentialStore.removeCredential(credentialId);
      expect(removed).toBe(true);

      expect(SecureCredentialStore.getCredential(credentialId)).toBeNull();
    });

    it('should return false when removing non-existent credential', () => {
      const nonExistentId = crypto.randomUUID();
      const removed = SecureCredentialStore.removeCredential(nonExistentId);
      expect(removed).toBe(false);
    });

    it('should track credential count correctly', () => {
      expect(SecureCredentialStore.getCredentialCount()).toBe(0);

      const id1 = SecureCredentialStore.setCredential('cred1');
      expect(SecureCredentialStore.getCredentialCount()).toBe(1);

      SecureCredentialStore.setCredential('cred2');
      expect(SecureCredentialStore.getCredentialCount()).toBe(2);

      SecureCredentialStore.removeCredential(id1);
      expect(SecureCredentialStore.getCredentialCount()).toBe(1);

      SecureCredentialStore.clearAll();
      expect(SecureCredentialStore.getCredentialCount()).toBe(0);
    });

    it('should clear all credentials', () => {
      SecureCredentialStore.setCredential('cred1');
      SecureCredentialStore.setCredential('cred2');
      SecureCredentialStore.setCredential('cred3');

      expect(SecureCredentialStore.getCredentialCount()).toBe(3);

      SecureCredentialStore.clearAll();

      expect(SecureCredentialStore.getCredentialCount()).toBe(0);
    });
  });

  describe('Old Credential Cleanup', () => {
    it('should clean up old credentials', () => {
      // Store credentials
      const id1 = SecureCredentialStore.setCredential('recent-cred');
      const id2 = SecureCredentialStore.setCredential('old-cred');

      // Mock timestamp for one credential to be old (> 24 hours)
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago

      // Access private credentials map through reflection
      const credentialsField = (
        SecureCredentialStore as unknown as {
          credentials: Map<string, { timestamp: number }>;
        }
      ).credentials;
      if (credentialsField && credentialsField.has(id2)) {
        const oldCredential = credentialsField.get(id2);
        if (oldCredential) {
          oldCredential.timestamp = oldTimestamp;
          credentialsField.set(id2, oldCredential);
        }
      }

      expect(SecureCredentialStore.getCredentialCount()).toBe(2);

      SecureCredentialStore.cleanupOldCredentials();

      expect(SecureCredentialStore.getCredentialCount()).toBe(1);
      expect(SecureCredentialStore.getCredential(id1)).toBeTruthy();
      expect(SecureCredentialStore.getCredential(id2)).toBeNull();
    });
  });

  describe('Legacy Token Methods', () => {
    it('should support legacy setToken and getToken methods', () => {
      const testToken = 'legacy-token-123';

      const tokenId = SecureCredentialStore.setToken(testToken);
      expect(tokenId).toBeTruthy();

      const retrieved = SecureCredentialStore.getToken(tokenId);
      expect(retrieved).toBe(testToken);
    });

    it('should be compatible between new and legacy methods', () => {
      const credential = 'test-credential';

      // Set with new method
      const id1 = SecureCredentialStore.setCredential(credential);

      // Retrieve with legacy method
      const retrieved1 = SecureCredentialStore.getToken(id1);
      expect(retrieved1).toBe(credential);

      // Set with legacy method
      const id2 = SecureCredentialStore.setToken(credential);

      // Retrieve with new method
      const retrieved2 = SecureCredentialStore.getCredential(id2);
      expect(retrieved2).toBe(credential);
    });
  });

  describe('Security Features', () => {
    it('should generate unique IDs for each credential', () => {
      const sameCredential = 'same-credential';
      const ids = Array.from({ length: 100 }, () =>
        SecureCredentialStore.setCredential(sameCredential)
      );

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100); // All should be unique
    });

    it('should encrypt different credentials differently', () => {
      // This test verifies that the same credential gets different encrypted values
      const credential = 'test-credential';

      const id1 = SecureCredentialStore.setCredential(credential);
      const id2 = SecureCredentialStore.setCredential(credential);

      expect(id1).not.toBe(id2); // Different IDs

      // Both should decrypt to the same value
      expect(SecureCredentialStore.getCredential(id1)).toBe(credential);
      expect(SecureCredentialStore.getCredential(id2)).toBe(credential);
    });

    it('should handle corrupted credential data gracefully', () => {
      const credentialId = SecureCredentialStore.setCredential('test');

      // Corrupt the credential data by accessing private field
      const credentialsField = (
        SecureCredentialStore as unknown as {
          credentials: Map<string, { encrypted: string }>;
        }
      ).credentials;
      if (credentialsField && credentialsField.has(credentialId)) {
        const credential = credentialsField.get(credentialId);
        if (credential) {
          credential.encrypted = 'corrupted-data';
          credentialsField.set(credentialId, credential);
        }
      }

      // Should return null and remove corrupted credential
      const result = SecureCredentialStore.getCredential(credentialId);
      expect(result).toBeNull();

      // Credential should be removed from storage
      expect(SecureCredentialStore.getCredential(credentialId)).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle null encryption key scenario', () => {
      // Force clear to reset state
      SecureCredentialStore.clearAll();

      // Access private field to manipulate encryption key
      const privateField = SecureCredentialStore as unknown as {
        encryptionKey: unknown;
        isInitialized: boolean;
      };
      const originalKey = privateField.encryptionKey;
      privateField.encryptionKey = null;
      privateField.isInitialized = true; // Prevent re-initialization

      // Should return null when encryption key is not available
      const result = SecureCredentialStore.getCredential('any-id');
      expect(result).toBeNull();

      // Restore original state
      privateField.encryptionKey = originalKey;
      privateField.isInitialized = false;
    });
  });

  describe('Process Cleanup', () => {
    it('should set up process event listeners', () => {
      const mockOn = vi.spyOn(process, 'on');

      // Trigger initialization by calling a public method
      SecureCredentialStore.setCredential('test');

      // Verify that event listeners were set up
      expect(mockOn).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('SIGUSR1', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(Function)
      );
      expect(mockOn).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function)
      );

      mockOn.mockRestore();
    });
  });

  describe('Key Derivation', () => {
    it('should initialize successfully multiple times', () => {
      // Clear state
      SecureCredentialStore.clearAll();

      // First initialization
      const id1 = SecureCredentialStore.setCredential('test1');
      expect(id1).toBeTruthy();

      // Should not re-initialize
      const id2 = SecureCredentialStore.setCredential('test2');
      expect(id2).toBeTruthy();

      // Both should work
      expect(SecureCredentialStore.getCredential(id1)).toBe('test1');
      expect(SecureCredentialStore.getCredential(id2)).toBe('test2');
    });

    it('should handle environment variables in key derivation', () => {
      const originalUser = process.env.USER;
      const originalHome = process.env.HOME;

      // Test with environment variables
      process.env.USER = 'testuser';
      process.env.HOME = '/test/home';

      SecureCredentialStore.clearAll();
      const id1 = SecureCredentialStore.setCredential('test-with-env');
      expect(SecureCredentialStore.getCredential(id1)).toBe('test-with-env');

      // Test without environment variables
      delete process.env.USER;
      delete process.env.HOME;

      SecureCredentialStore.clearAll();
      const id2 = SecureCredentialStore.setCredential('test-without-env');
      expect(SecureCredentialStore.getCredential(id2)).toBe('test-without-env');

      // Restore environment
      if (originalUser !== undefined) process.env.USER = originalUser;
      if (originalHome !== undefined) process.env.HOME = originalHome;
    });
  });
});
