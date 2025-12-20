/**
 * Tests for npmPackage.ts - specifically for uncovered branches
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock executeNpmCommand
const mockExecuteNpmCommand = vi.fn();
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: (...args: unknown[]) => mockExecuteNpmCommand(...args),
}));

// Import after mocking
import {
  searchNpmPackage,
  checkNpmDeprecation,
} from '../../src/utils/npmPackage.js';

describe('npmPackage - branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapToResult - time object parsing', () => {
    it('should extract lastPublished from version-specific time', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                time: {
                  '1.0.0': '2024-01-15T10:30:00.000Z',
                  modified: '2024-01-20T10:30:00.000Z',
                },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.packages[0] as any)?.lastPublished).toBe(
          '2024-01-15T10:30:00.000Z'
        );
      }
    });

    it('should fallback to modified time when version time is missing', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                time: {
                  // No '1.0.0' key
                  modified: '2024-01-20T10:30:00.000Z',
                },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.packages[0] as any)?.lastPublished).toBe(
          '2024-01-20T10:30:00.000Z'
        );
      }
    });

    it('should handle missing time object', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                // No time object
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.packages[0] as any)?.lastPublished).toBeUndefined();
      }
    });

    it('should handle time object with no valid time strings', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                time: {
                  created: '2024-01-10T10:30:00.000Z',
                  // No '1.0.0' and no 'modified'
                },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // Should be undefined since neither version time nor modified exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.packages[0] as any)?.lastPublished).toBeUndefined();
      }
    });
  });

  describe('fetchPackageDetails - JSON parse error', () => {
    it('should return null on invalid JSON output', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: 'not valid json {{{',
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect(result.packages).toHaveLength(0);
      }
    });

    it('should return null when parsed data is undefined', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: 'null',
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect(result.packages).toHaveLength(0);
      }
    });
  });

  describe('searchNpmPackageViaSearch - catch block', () => {
    it('should handle thrown errors in search', async () => {
      mockExecuteNpmCommand.mockImplementation((cmd: string) => {
        if (cmd === 'search') {
          throw new Error('Unexpected error');
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });

      // Use keyword search (with space) to trigger npm search flow
      const result = await searchNpmPackage('test pkg keyword', 5, false);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Unexpected error');
      }
    });

    it('should handle non-Error thrown values', async () => {
      mockExecuteNpmCommand.mockImplementation((cmd: string) => {
        if (cmd === 'search') {
          throw 'string error';
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });

      // Use keyword search (with space) to trigger npm search flow
      const result = await searchNpmPackage('test pkg keyword', 5, false);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('string error');
      }
    });
  });

  describe('checkNpmDeprecation - edge cases', () => {
    it('should handle command error', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        error: new Error('Command failed'),
        stdout: '',
        stderr: '',
        exitCode: 1,
      });

      const result = await checkNpmDeprecation('test-pkg');

      expect(result).toBeNull();
    });

    it('should handle exception in deprecation check', async () => {
      mockExecuteNpmCommand.mockRejectedValue(new Error('Network error'));

      const result = await checkNpmDeprecation('test-pkg');

      expect(result).toBeNull();
    });

    it('should handle non-string deprecation message', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: JSON.stringify({ reason: 'deprecated for reasons' }),
        stderr: '',
        exitCode: 0,
      });

      const result = await checkNpmDeprecation('test-pkg');

      expect(result).toEqual({
        deprecated: true,
        message: 'This package is deprecated',
      });
    });

    it('should handle unparseable deprecation output', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: 'Package is deprecated - use other-pkg instead',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkNpmDeprecation('test-pkg');

      expect(result).toEqual({
        deprecated: true,
        message: 'Package is deprecated - use other-pkg instead',
      });
    });
  });

  describe('isExactPackageName', () => {
    it('should handle scoped packages as exact names', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: '@scope/pkg',
                version: '1.0.0',
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('@scope/pkg', 1, false);

      expect('packages' in result).toBe(true);
      // Should use view (exact name) not search
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('view', [
        '@scope/pkg',
        '--json',
      ]);
    });

    it('should treat names with spaces as keyword search', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      await searchNpmPackage('test package', 5, false);

      // Should use search not view
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('search', [
        'test package',
        '--json',
        '--searchlimit=5',
      ]);
    });
  });

  describe('fetchPackageDetails - outer catch', () => {
    it('should return null when executeNpmCommand throws', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            throw new Error('Unexpected crash');
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect(result.packages).toHaveLength(0);
      }
    });
  });
});
