/**
 * Keychain Tests for octocode-shared
 *
 * Tests for native keychain access using mocked child_process.
 * Covers macOS, Windows, and Linux implementations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import * as os from 'node:os';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock os
vi.mock('node:os', () => ({
  platform: vi.fn(),
}));

/**
 * Helper to create a mock spawn child process
 */
function createMockSpawn(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
  delay?: number;
}): childProcess.ChildProcess {
  const { stdout = '', stderr = '', exitCode = 0, error, delay = 0 } = options;

  const child = new EventEmitter() as childProcess.ChildProcess;
  child.stdout = new EventEmitter() as any;
  child.stderr = new EventEmitter() as any;
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  } as any;
  child.kill = vi.fn().mockReturnValue(true);

  // Emit events after a microtask to simulate async behavior
  setTimeout(() => {
    if (error) {
      child.emit('error', error);
    } else {
      if (stdout) {
        child.stdout!.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        child.stderr!.emit('data', Buffer.from(stderr));
      }
      child.emit('close', exitCode);
    }
  }, delay);

  return child;
}

describe('Keychain', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // isKeychainAvailable tests
  // ==========================================================================
  describe('isKeychainAvailable', () => {
    it('should return true on macOS when security command is available', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from('/usr/bin/security')
      );

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(true);
    });

    it('should return false on macOS when security command is not available', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(false);
    });

    it('should return true on Windows when PowerShell is available', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from(
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
        )
      );

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(true);
    });

    it('should return false on Windows when PowerShell is not available', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(false);
    });

    it('should return true on Linux when secret-tool is available', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from('/usr/bin/secret-tool')
      );

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(true);
    });

    it('should return false on Linux when secret-tool is not available', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(false);
    });

    it('should return false on unsupported platforms', async () => {
      vi.mocked(os.platform).mockReturnValue('freebsd' as NodeJS.Platform);

      const { isKeychainAvailable } =
        await import('../../src/credentials/keychain.js');
      expect(isKeychainAvailable()).toBe(false);
    });
  });

  // ==========================================================================
  // macOS setPassword tests
  // ==========================================================================
  describe('setPassword - macOS', () => {
    it('should store password on macOS successfully', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 0 })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).resolves.toBeUndefined();
    });

    it('should throw error on macOS when spawn has error', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ error: new Error('spawn failed') })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).rejects.toThrow('spawn failed');
    });

    it('should throw error on macOS when spawn has non-zero exit code', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1, stderr: 'some error' })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).rejects.toThrow('Failed to store password');
    });
  });

  // ==========================================================================
  // Windows setPassword tests
  // ==========================================================================
  describe('setPassword - Windows', () => {
    it('should store password on Windows successfully', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 0 })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).resolves.toBeUndefined();
    });

    it('should throw error on Windows when spawn fails', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1, stderr: 'cmdkey error' })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).rejects.toThrow('Failed to store password');
    });
  });

  // ==========================================================================
  // Linux setPassword tests
  // ==========================================================================
  describe('setPassword - Linux', () => {
    it('should store password on Linux successfully', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 0 })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).resolves.toBeUndefined();
    });

    it('should throw error on Linux when spawn fails', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1, stderr: 'secret-tool error' })
      );

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).rejects.toThrow('Failed to store password');
    });
  });

  // ==========================================================================
  // setPassword unsupported platform
  // ==========================================================================
  describe('setPassword - unsupported', () => {
    it('should throw error on unsupported platform', async () => {
      vi.mocked(os.platform).mockReturnValue('freebsd' as NodeJS.Platform);

      const { setPassword } = await import('../../src/credentials/keychain.js');
      await expect(
        setPassword('test-service', 'test-account', 'test-password')
      ).rejects.toThrow('Keychain not supported on freebsd');
    });
  });

  // ==========================================================================
  // macOS getPassword tests
  // ==========================================================================
  describe('getPassword - macOS', () => {
    it('should return password on macOS when found', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ stdout: 'my-secret-password\n', exitCode: 0 })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBe('my-secret-password');
    });

    it('should return null on macOS when password not found', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 44, stderr: 'security: not found' })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBeNull();
    });

    it('should return null on macOS when spawn has error', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ error: new Error('spawn failed') })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Windows getPassword tests
  // ==========================================================================
  describe('getPassword - Windows', () => {
    it('should return password on Windows when found', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ stdout: 'my-secret-password\r\n', exitCode: 0 })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBe('my-secret-password');
    });

    it('should return null on Windows when password not found', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1, stderr: 'credential not found' })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Linux getPassword tests
  // ==========================================================================
  describe('getPassword - Linux', () => {
    it('should return password on Linux when found', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ stdout: 'my-secret-password', exitCode: 0 })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBe('my-secret-password');
    });

    it('should return null on Linux when password not found', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1 })
      );

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getPassword unsupported platform
  // ==========================================================================
  describe('getPassword - unsupported', () => {
    it('should return null on unsupported platform', async () => {
      vi.mocked(os.platform).mockReturnValue('freebsd' as NodeJS.Platform);

      const { getPassword } = await import('../../src/credentials/keychain.js');
      const result = await getPassword('test-service', 'test-account');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // macOS deletePassword tests
  // ==========================================================================
  describe('deletePassword - macOS', () => {
    it('should return true on macOS when deleted successfully', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 0 })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(true);
    });

    it('should return false on macOS when password not found', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 44 })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(false);
    });

    it('should return false on macOS when spawn has error', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ error: new Error('spawn failed') })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Windows deletePassword tests
  // ==========================================================================
  describe('deletePassword - Windows', () => {
    it('should return true on Windows when deleted successfully', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 0 })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(true);
    });

    it('should return false on Windows when credential not found', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1 })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Linux deletePassword tests
  // ==========================================================================
  describe('deletePassword - Linux', () => {
    it('should return true on Linux when deleted successfully', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 0 })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(true);
    });

    it('should return false on Linux when spawn fails', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ error: new Error('spawn failed') })
      );

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // deletePassword unsupported platform
  // ==========================================================================
  describe('deletePassword - unsupported', () => {
    it('should return false on unsupported platform', async () => {
      vi.mocked(os.platform).mockReturnValue('freebsd' as NodeJS.Platform);

      const { deletePassword } =
        await import('../../src/credentials/keychain.js');
      const result = await deletePassword('test-service', 'test-account');
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // macOS findCredentials tests
  // ==========================================================================
  describe('findCredentials - macOS', () => {
    it('should return empty array on macOS when no credentials found', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ stdout: '', exitCode: 0 })
      );

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');
      expect(result).toEqual([]);
    });

    it('should return empty array on macOS when spawn fails', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1, stderr: 'error' })
      );

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');
      expect(result).toEqual([]);
    });

    it('should return empty array on macOS when spawn has error', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ error: new Error('spawn failed') })
      );

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');
      expect(result).toEqual([]);
    });

    it('should parse keychain dump and return matching credentials', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');

      const dumpOutput = `keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="test-service"
    "acct"<blob>="account1"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="other-service"
    "acct"<blob>="account2"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="test-service"
    "acct"<blob>="account3"`;

      // First call for dump-keychain, then for find-generic-password
      let callCount = 0;
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // dump-keychain
          return createMockSpawn({ stdout: dumpOutput, exitCode: 0 });
        } else {
          // find-generic-password (for getting actual password)
          return createMockSpawn({
            stdout: `password${callCount}\n`,
            exitCode: 0,
          });
        }
      });

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      // Should find 2 accounts (account1 and account3) for test-service
      expect(result.length).toBe(2);
      expect(result[0].account).toBe('account1');
      expect(result[1].account).toBe('account3');
    });

    it('should skip credentials that fail to retrieve', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');

      const dumpOutput = `keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="test-service"
    "acct"<blob>="account1"`;

      let callCount = 0;
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // dump-keychain
          return createMockSpawn({ stdout: dumpOutput, exitCode: 0 });
        } else {
          // find-generic-password fails
          return createMockSpawn({ exitCode: 44, stderr: 'not found' });
        }
      });

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // Windows findCredentials tests
  // ==========================================================================
  describe('findCredentials - Windows', () => {
    it('should parse cmdkey output and return matching credentials', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');

      const cmdkeyOutput = `
Currently stored credentials:

    Target: test-service:account1
    Type: Generic
    User: account1

    Target: other-service:account2
    Type: Generic
    User: account2

    Target: test-service:account3
    Type: Generic
    User: account3
`;

      let callCount = 0;
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // cmdkey /list
          return createMockSpawn({ stdout: cmdkeyOutput, exitCode: 0 });
        } else {
          // PowerShell credential read
          return createMockSpawn({
            stdout: `password${callCount}\r\n`,
            exitCode: 0,
          });
        }
      });

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      expect(result.length).toBe(2);
      expect(result[0].account).toBe('account1');
      expect(result[1].account).toBe('account3');
    });

    it('should return empty array on Windows when no credentials found', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ stdout: '', exitCode: 0 })
      );

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // Linux findCredentials tests
  // ==========================================================================
  describe('findCredentials - Linux', () => {
    it('should parse secret-tool output and return matching credentials', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');

      const searchOutput = `
[/org/freedesktop/secrets/collection/login/1]
label = test-service - account1
secret =
created = 2024-01-01
modified = 2024-01-01
schema = org.freedesktop.Secret.Generic
attribute.service = test-service
attribute.account = account1

[/org/freedesktop/secrets/collection/login/2]
label = test-service - account2
secret =
created = 2024-01-01
modified = 2024-01-01
schema = org.freedesktop.Secret.Generic
attribute.service = test-service
attribute.account = account2
`;

      let callCount = 0;
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // secret-tool search
          return createMockSpawn({ stdout: searchOutput, exitCode: 0 });
        } else {
          // secret-tool lookup
          return createMockSpawn({
            stdout: `password${callCount}`,
            exitCode: 0,
          });
        }
      });

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');

      expect(result.length).toBe(2);
    });

    it('should return empty array on Linux when no credentials found', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockSpawn({ exitCode: 1 })
      );

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // findCredentials unsupported platform
  // ==========================================================================
  describe('findCredentials - unsupported', () => {
    it('should return empty array on unsupported platform', async () => {
      vi.mocked(os.platform).mockReturnValue('freebsd' as NodeJS.Platform);

      const { findCredentials } =
        await import('../../src/credentials/keychain.js');
      const result = await findCredentials('test-service');
      expect(result).toEqual([]);
    });
  });
});
