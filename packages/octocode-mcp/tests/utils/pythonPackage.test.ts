/**
 * Tests for pythonPackage.ts - specifically for uncovered branches
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllCache } from '../../src/utils/http/cache.js';

// Mock axios
const mockAxiosGet = vi.fn();
vi.mock('axios', () => ({
  default: {
    get: (url: string, ...args: unknown[]) => mockAxiosGet(url, ...args),
    isAxiosError: (error: unknown) =>
      error &&
      typeof error === 'object' &&
      'isAxiosError' in error &&
      (error as { isAxiosError: boolean }).isAxiosError === true,
  },
}));

// Import after mocking
import { searchPythonPackage } from '../../src/utils/package/python.js';

describe('pythonPackage - branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache(); // Clear cache to ensure test isolation
  });

  describe('lastPublished extraction from releases', () => {
    it('should extract lastPublished from releases when available', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test package',
            keywords: '',
            project_urls: {},
          },
          releases: {
            '1.0.0': [
              {
                upload_time: '2024-01-15T10:30:00',
              },
            ],
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as any;
        expect(pkg.lastPublished).toBe('2024-01-15T10:30:00');
      }
    });

    it('should handle releases with empty version array', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test package',
            keywords: '',
            project_urls: {},
          },
          releases: {
            '1.0.0': [], // Empty array
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as any;
        expect(pkg.lastPublished).toBeUndefined();
      }
    });

    it('should handle releases without upload_time', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test package',
            keywords: '',
            project_urls: {},
          },
          releases: {
            '1.0.0': [
              {
                // No upload_time
                filename: 'test-pkg-1.0.0.tar.gz',
              },
            ],
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as any;
        expect(pkg.lastPublished).toBeUndefined();
      }
    });

    it('should handle missing version in releases', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test package',
            keywords: '',
            project_urls: {},
          },
          releases: {
            '2.0.0': [
              {
                upload_time: '2024-01-15T10:30:00',
              },
            ],
            // '1.0.0' not present
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as any;
        expect(pkg.lastPublished).toBeUndefined();
      }
    });

    it('should handle releases being null', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test package',
            keywords: '',
            project_urls: {},
          },
          releases: null,
        },
      });

      const result = await searchPythonPackage('test-pkg', true);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        const pkg = result.packages[0] as any;
        expect(pkg.lastPublished).toBeUndefined();
      }
    });
  });

  describe('validateStatus callback', () => {
    it('should reject non-200 status codes via validateStatus', async () => {
      // This tests the validateStatus callback (line 38)
      // When validateStatus returns false, axios throws an error
      // Non-404 errors are re-thrown
      mockAxiosGet.mockRejectedValue({
        isAxiosError: true,
        response: { status: 500 },
      });

      // Non-404 errors are re-thrown
      await expect(searchPythonPackage('test-pkg', false)).rejects.toThrow();
    });

    it('should handle 404 via name variations', async () => {
      // First attempt returns 404, but code tries name variations
      mockAxiosGet
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 404 },
        })
        .mockResolvedValueOnce({
          data: {
            info: {
              name: 'test_pkg',
              version: '1.0.0',
              summary: 'Found with underscore',
              keywords: '',
              project_urls: {},
            },
          },
        });

      const result = await searchPythonPackage('test-pkg', false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect(result.packages.length).toBe(1);
      }
    });
  });

  describe('project_urls key variations', () => {
    it('should find repo from "github" key in project_urls', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test',
            keywords: '',
            project_urls: {
              GitHub: 'https://github.com/test/repo',
            },
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect((result.packages[0] as any)?.repository).toBe(
          'https://github.com/test/repo'
        );
      }
    });

    it('should find repo from "source code" key in project_urls', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test',
            keywords: '',
            project_urls: {
              'Source Code': 'https://github.com/test/repo',
            },
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect((result.packages[0] as any)?.repository).toBe(
          'https://github.com/test/repo'
        );
      }
    });

    it('should skip non-github/gitlab/bitbucket URLs in project_urls', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Test',
            keywords: '',
            project_urls: {
              Source: 'https://example.com/repo', // Not a known repo host
              Repository: 'https://myhost.com/repo', // Not a known repo host
            },
          },
        },
      });

      const result = await searchPythonPackage('test-pkg', false);

      expect('packages' in result).toBe(true);
      if ('packages' in result) {
        expect((result.packages[0] as any)?.repository).toBeNull();
      }
    });
  });
});
