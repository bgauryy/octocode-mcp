/**
 * Tests for npmPackage.ts - specifically for uncovered branches
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllCache } from '../../src/utils/http/cache.js';
import type { NpmPackageResult } from '../../src/utils/package/common.js';

// Mock executeNpmCommand
const mockExecuteNpmCommand = vi.fn();
vi.mock('../../src/utils/exec/index.js', () => ({
  executeNpmCommand: (...args: unknown[]) => mockExecuteNpmCommand(...args),
}));

// Import after mocking
import {
  searchNpmPackage,
  checkNpmDeprecation,
} from '../../src/utils/package/npm.js';

describe('npmPackage - branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache(); // Clear cache to ensure test isolation
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

    it('should use search when limit > 1 even for exact package name', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: JSON.stringify([
          { name: 'react', version: '18.0.0', links: {} },
          { name: 'react-dom', version: '18.0.0', links: {} },
        ]),
        stderr: '',
        exitCode: 0,
      });

      await searchNpmPackage('react', 5, false);

      // Should use search not view because limit > 1
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('search', [
        'react',
        '--json',
        '--searchlimit=5',
      ]);
    });

    it('should use view when limit === 1 for exact package name', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: JSON.stringify({
          name: 'react',
          version: '18.0.0',
        }),
        stderr: '',
        exitCode: 0,
      });

      await searchNpmPackage('react', 1, false);

      // Should use view because limit === 1 and name is exact
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('view', [
        'react',
        '--json',
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

  describe('mapToResult - extended metadata coverage', () => {
    it('should extract author as string when fetchMetadata is true', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                author: 'John Doe <john@example.com>',
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.author).toBe('John Doe <john@example.com>');
      }
    });

    it('should extract author.name from object when fetchMetadata is true', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                author: { name: 'Jane Doe', email: 'jane@example.com' },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.author).toBe('Jane Doe');
      }
    });

    it('should extract peerDependencies when fetchMetadata is true', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                peerDependencies: {
                  react: '^18.0.0',
                  'react-dom': '^18.0.0',
                },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.peerDependencies).toEqual({
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        });
      }
    });

    it('should extract all extended metadata fields', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'full-pkg',
                version: '2.0.0',
                description: 'A full featured package',
                keywords: ['test', 'example', 'demo'],
                license: 'MIT',
                homepage: 'https://example.com',
                author: { name: 'Test Author' },
                engines: { node: '>=18.0.0' },
                dependencies: { lodash: '^4.17.21' },
                peerDependencies: { react: '^18.0.0' },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('full-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.description).toBe('A full featured package');
        expect(pkg?.keywords).toEqual(['test', 'example', 'demo']);
        expect(pkg?.license).toBe('MIT');
        expect(pkg?.homepage).toBe('https://example.com');
        expect(pkg?.author).toBe('Test Author');
        expect(pkg?.engines).toEqual({ node: '>=18.0.0' });
        expect(pkg?.dependencies).toEqual({ lodash: '^4.17.21' });
        expect(pkg?.peerDependencies).toEqual({ react: '^18.0.0' });
      }
    });

    it('should extract license.type from object when fetchMetadata is true', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                license: { type: 'Apache-2.0', url: 'https://...' },
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.license).toBe('Apache-2.0');
      }
    });

    it('should not include extended metadata when fetchMetadata is false', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                description: 'Should not be included',
                author: 'Should not be included',
                peerDependencies: { react: '^18.0.0' },
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
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.description).toBeUndefined();
        expect(pkg?.author).toBeUndefined();
        expect(pkg?.peerDependencies).toBeUndefined();
      }
    });

    it('should handle empty engines object', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                engines: {},
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // Empty engines should not be included
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.engines).toBeUndefined();
      }
    });

    it('should handle empty keywords array', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                keywords: [],
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // Empty keywords should not be included
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.keywords).toBeUndefined();
      }
    });

    it('should handle empty dependencies object', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                dependencies: {},
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // Empty dependencies should not be included
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.dependencies).toBeUndefined();
      }
    });

    it('should handle empty peerDependencies object', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                peerDependencies: {},
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // Empty peerDependencies should not be included
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.peerDependencies).toBeUndefined();
      }
    });

    it('should handle author object without name property', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'view' && args[1] === '--json') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'test-pkg',
                version: '1.0.0',
                author: { email: 'test@example.com' }, // No name property
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test-pkg', 1, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        // Author without name should not be included
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.author).toBeUndefined();
      }
    });
  });

  describe('searchNpmPackageViaSearch - result handling', () => {
    it('should fetch metadata for each search result when fetchMetadata is true', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === 'search') {
            return Promise.resolve({
              stdout: JSON.stringify([
                {
                  name: 'pkg-1',
                  version: '1.0.0',
                  links: { repository: 'https://github.com/test/pkg-1' },
                },
                {
                  name: 'pkg-2',
                  version: '2.0.0',
                  links: { repository: 'https://github.com/test/pkg-2' },
                },
              ]),
              stderr: '',
              exitCode: 0,
            });
          }
          if (cmd === 'view' && args[0] === 'pkg-1') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'pkg-1',
                version: '1.0.0',
                description: 'Package 1 description',
                repository: 'https://github.com/test/pkg-1',
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          if (cmd === 'view' && args[0] === 'pkg-2') {
            return Promise.resolve({
              stdout: JSON.stringify({
                name: 'pkg-2',
                version: '2.0.0',
                description: 'Package 2 description',
                repository: 'https://github.com/test/pkg-2',
              }),
              stderr: '',
              exitCode: 0,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test keyword', 5, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect(result.packages).toHaveLength(2);
        const pkg0 = result.packages[0] as NpmPackageResult | undefined;
        const pkg1 = result.packages[1] as NpmPackageResult | undefined;
        expect(pkg0?.description).toBe('Package 1 description');
        expect(pkg1?.description).toBe('Package 2 description');
      }
    });

    it('should use basic result when fetchPackageDetails fails', async () => {
      mockExecuteNpmCommand.mockImplementation(
        (cmd: string, _args: string[]) => {
          if (cmd === 'search') {
            return Promise.resolve({
              stdout: JSON.stringify([
                {
                  name: 'pkg-1',
                  version: '1.0.0',
                  links: { repository: 'https://github.com/test/pkg-1' },
                },
              ]),
              stderr: '',
              exitCode: 0,
            });
          }
          if (cmd === 'view') {
            // Fail to fetch details
            return Promise.resolve({
              stdout: '',
              stderr: 'Not found',
              exitCode: 1,
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
      );

      const result = await searchNpmPackage('test keyword', 5, true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect(result.packages).toHaveLength(1);
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.path).toBe('pkg-1');
        expect(pkg?.version).toBe('1.0.0');
      }
    });

    it('should handle search result with missing links.repository', async () => {
      mockExecuteNpmCommand.mockImplementation((cmd: string) => {
        if (cmd === 'search') {
          return Promise.resolve({
            stdout: JSON.stringify([
              {
                name: 'pkg-no-repo',
                version: '1.0.0',
                links: {}, // No repository link
              },
            ]),
            stderr: '',
            exitCode: 0,
          });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });

      const result = await searchNpmPackage('test keyword', 5, false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as NpmPackageResult | undefined;
        expect(pkg?.repoUrl).toBeNull();
      }
    });

    it('should handle non-array search response', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '"not an array"',
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('test keyword', 5, false);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Invalid npm search response');
      }
    });
  });
});
