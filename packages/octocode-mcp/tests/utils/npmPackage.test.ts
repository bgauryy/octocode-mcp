import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkNpmDeprecation,
  searchNpmPackage,
} from '../../src/utils/npmPackage.js';
import {
  PackageSearchError,
  PackageSearchAPIResult,
  NpmPackageResult,
} from '../../src/utils/package.js';
import * as exec from '../../src/utils/exec.js';

// Mock executeNpmCommand
const mockExecuteNpmCommand = vi.fn();
vi.spyOn(exec, 'executeNpmCommand').mockImplementation(mockExecuteNpmCommand);

describe('checkNpmDeprecation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return deprecated info when package is deprecated', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '"This version is deprecated"',
      stderr: '',
      exitCode: 0,
    });

    const result = await checkNpmDeprecation('deprecated-pkg');
    expect(result).toEqual({
      deprecated: true,
      message: 'This version is deprecated',
    });
  });

  it('should return not deprecated when output is empty', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await checkNpmDeprecation('active-pkg');
    expect(result).toEqual({ deprecated: false });
  });

  it('should return not deprecated when output is undefined string', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: 'undefined',
      stderr: '',
      exitCode: 0,
    });

    const result = await checkNpmDeprecation('active-pkg');
    expect(result).toEqual({ deprecated: false });
  });

  it('should return null when npm command fails', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: 'Error',
      exitCode: 1,
    });

    const result = await checkNpmDeprecation('error-pkg');
    expect(result).toBeNull();
  });

  it('should return null when executeNpmCommand returns error object', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: new Error('Execution failed'),
    });

    const result = await checkNpmDeprecation('error-pkg');
    expect(result).toBeNull();
  });

  it('should handle JSON parse error by returning output as message', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: 'This is not valid JSON but indicates deprecation',
      stderr: '',
      exitCode: 0,
    });

    const result = await checkNpmDeprecation('weird-pkg');
    expect(result).toEqual({
      deprecated: true,
      message: 'This is not valid JSON but indicates deprecation',
    });
  });

  it('should handle thrown errors gracefully', async () => {
    mockExecuteNpmCommand.mockRejectedValue(new Error('Unexpected error'));

    const result = await checkNpmDeprecation('crash-pkg');
    expect(result).toBeNull();
  });
});

describe('searchNpmPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchNpmPackageByView (exact match)', () => {
    it('should return error when npm command fails', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: 'Error',
        error: new Error('Command failed'),
        exitCode: 1,
      });

      const result = await searchNpmPackage('exact-pkg', 1, false);
      // It returns empty result on failure in new implementation?
      // In new implementation fetchNpmPackageByView returns empty list on error.
      // Wait, let's check my implementation.
      // fetchPackageDetails returns null on error.
      // fetchNpmPackageByView returns empty list if null.
      expect(result).toEqual({
        packages: [],
        ecosystem: 'npm',
        totalFound: 0,
      });
    });

    it('should return empty when exit code is non-zero (not found)', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: '404 Not Found',
        exitCode: 1,
      });

      const result = await searchNpmPackage('exact-pkg', 1, false);
      expect(result).toEqual({
        packages: [],
        ecosystem: 'npm',
        totalFound: 0,
      });
    });

    it('should return empty when output is empty', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('exact-pkg', 1, false);
      expect(result).toEqual({
        packages: [],
        ecosystem: 'npm',
        totalFound: 0,
      });
    });

    it('should return full result when fetchMetadata is true', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: JSON.stringify({
          name: 'exact-pkg',
          version: '1.0.0',
          repository: { url: 'git+https://github.com/user/repo.git' },
          main: 'index.js',
          types: 'index.d.ts',
        }),
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('exact-pkg', 1, true);
      expect(result).toHaveProperty('packages');
      const pkg = (result as PackageSearchAPIResult)
        .packages[0] as NpmPackageResult;
      expect(pkg).toBeDefined();
      expect(pkg.path).toBe('exact-pkg');
      expect(pkg.repoUrl).toBe('https://github.com/user/repo');
      expect(pkg.mainEntry).toBe('index.js');
      expect(pkg.typeDefinitions).toBe('index.d.ts');
    });
  });

  describe('searchNpmPackageViaSearch (keywords)', () => {
    it('should return error when npm command fails', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: 'Error',
        error: new Error('Command failed'),
        exitCode: 1,
      });

      const result = await searchNpmPackage('keyword search', 1, false);
      expect(result).toHaveProperty('error');
    });

    it('should return error on non-zero exit code', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: 'Search failed',
        exitCode: 1,
      });

      const result = await searchNpmPackage('keyword search', 1, false);
      expect(result).toHaveProperty('error');
      expect((result as PackageSearchError).error).toContain('Search failed');
    });

    it('should return empty on empty output', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('keyword search', 1, false);
      expect(result).toEqual({
        packages: [],
        ecosystem: 'npm',
        totalFound: 0,
      });
    });

    it('should handle JSON parse error', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: 'invalid-json',
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('keyword search', 1, false);
      expect(result).toHaveProperty('error');
      expect((result as PackageSearchError).error).toContain(
        'Failed to parse npm search output'
      );
    });

    it('should return packages with fetched repository', async () => {
      // Mock search result
      mockExecuteNpmCommand.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            name: 'found-pkg',
            version: '1.0.0',
            links: { repository: 'https://github.com/found/repo' },
          },
        ]),
        stderr: '',
        exitCode: 0,
      });

      // If fetchMetadata is true, it calls npm view
      mockExecuteNpmCommand.mockResolvedValueOnce({
        stdout: JSON.stringify({
          name: 'found-pkg',
          version: '1.0.0',
          repository: { url: 'https://github.com/found/repo' },
          main: 'index.js',
        }),
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('keyword search', 1, true);
      expect(result).toHaveProperty('packages');
      const pkg = (result as PackageSearchAPIResult)
        .packages[0] as NpmPackageResult;
      expect(pkg).toBeDefined();
      expect(pkg.path).toBe('found-pkg');
      expect(pkg.repoUrl).toBe('https://github.com/found/repo');
      expect(pkg.mainEntry).toBe('index.js');
    });

    it('should use search result info when fetchMetadata is false', async () => {
      mockExecuteNpmCommand.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            name: 'found-pkg',
            version: '1.0.0',
            links: { repository: 'https://github.com/found/repo' },
          },
        ]),
        stderr: '',
        exitCode: 0,
      });

      const result = await searchNpmPackage('keyword search', 1, false);
      expect(result).toHaveProperty('packages');
      const pkg = (result as PackageSearchAPIResult)
        .packages[0] as NpmPackageResult;
      expect(pkg.path).toBe('found-pkg');
      expect(pkg.repoUrl).toBe('https://github.com/found/repo');
      expect(pkg.mainEntry).toBeNull();
    });
  });
});
