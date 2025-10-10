import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the GitHub client
const mockOctokit = vi.hoisted(() => ({
  rest: {
    search: {
      code: vi.fn(),
    },
  },
}));

vi.mock('../../src/github/client.js', () => ({
  getOctokit: vi.fn(() => mockOctokit),
}));

// Mock the cache to prevent interference
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
}));

// Import after mocking
import { searchGitHubCodeAPI } from '../../src/github/codeSearch.js';

describe('Code Search Filtering - File Filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Folder filtering', () => {
    it('should filter out files in node_modules', async () => {
      const mockResponse = {
        data: {
          total_count: 3,
          items: [
            {
              name: 'index.js',
              path: 'src/index.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [
                {
                  fragment: 'function test() {}',
                  matches: [{ indices: [0, 8] }],
                },
              ],
            },
            {
              name: 'lodash.js',
              path: 'node_modules/lodash/lodash.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [
                {
                  fragment: 'function lodash() {}',
                  matches: [{ indices: [0, 8] }],
                },
              ],
            },
            {
              name: 'package.json',
              path: 'node_modules/react/package.json',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['function'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/index.js',
            url: 'src/index.js',
            repository: {
              nameWithOwner: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            matches: [
              {
                context: 'function test(){}',
                positions: [[0, 8]],
              },
            ],
            minificationType: 'terser',
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should filter out multiple ignored directories', async () => {
      const mockResponse = {
        data: {
          total_count: 7,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'test.js',
              path: 'dist/test.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'build.js',
              path: 'build/build.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'vendor.js',
              path: 'vendor/vendor.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'cache.js',
              path: '.cache/cache.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'git.js',
              path: '.git/hooks/pre-commit',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'valid.js',
              path: 'src/components/valid.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['test'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/components/valid.js',
            url: 'src/components/valid.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });
  });

  describe('File name filtering', () => {
    it('should filter out lock files', async () => {
      const mockResponse = {
        data: {
          total_count: 4,
          items: [
            {
              name: 'package.json',
              path: 'package.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'yarn.lock',
              path: 'yarn.lock',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'index.js',
              path: 'src/index.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['test'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'package.json',
            url: 'package.json',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/index.js',
            url: 'src/index.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should filter out configuration files', async () => {
      const mockResponse = {
        data: {
          total_count: 6,
          items: [
            {
              name: '.gitignore',
              path: '.gitignore',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: '.eslintrc',
              path: '.eslintrc',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'tsconfig.json',
              path: 'tsconfig.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'webpack.config.js',
              path: 'webpack.config.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'Dockerfile',
              path: 'Dockerfile',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['config'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: '.gitignore',
            url: '.gitignore',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: '.eslintrc',
            url: '.eslintrc',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'tsconfig.json',
            url: 'tsconfig.json',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'webpack.config.js',
            url: 'webpack.config.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'Dockerfile',
            url: 'Dockerfile',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should filter out sensitive files', async () => {
      const mockResponse = {
        data: {
          total_count: 5,
          items: [
            {
              name: '.env',
              path: '.env',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: '.env.local',
              path: '.env.local',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'secrets.json',
              path: 'secrets.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'credentials.json',
              path: 'config/credentials.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'config.js',
              path: 'src/config.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['env'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: '.env',
            url: '.env',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: '.env.local',
            url: '.env.local',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/config.js',
            url: 'src/config.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });
  });

  describe('File extension filtering', () => {
    it('should filter out binary and compiled files', async () => {
      const mockResponse = {
        data: {
          total_count: 8,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'app.exe',
              path: 'bin/app.exe',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'lib.dll',
              path: 'lib/lib.dll',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'module.so',
              path: 'lib/module.so',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'Main.class',
              path: 'build/Main.class',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'cache.pyc',
              path: '__pycache__/cache.pyc',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'app.jar',
              path: 'dist/app.jar',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'main.py',
              path: 'src/main.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['app'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/main.py',
            url: 'src/main.py',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should filter out minified files', async () => {
      const mockResponse = {
        data: {
          total_count: 3,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'app.min.js',
              path: 'dist/app.min.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'styles.min.css',
              path: 'dist/styles.min.css',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['app'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should filter out archive files', async () => {
      const mockResponse = {
        data: {
          total_count: 6,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'backup.zip',
              path: 'backup.zip',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'archive.tar.gz',
              path: 'archive.tar.gz',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'data.rar',
              path: 'data.rar',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'package.7z',
              path: 'package.7z',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'readme.md',
              path: 'readme.md',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['test'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'readme.md',
            url: 'readme.md',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should filter out temporary and cache files', async () => {
      const mockResponse = {
        data: {
          total_count: 6,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'file.tmp',
              path: 'temp/file.tmp',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'data.cache',
              path: 'cache/data.cache',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'backup.bak',
              path: 'backup.bak',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: '.swp',
              path: '.swp',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'error.log',
              path: 'logs/error.log',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['test'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });
  });

  describe('Combined filtering scenarios', () => {
    it('should handle mixed valid and invalid files correctly', async () => {
      const mockResponse = {
        data: {
          total_count: 10,
          items: [
            // Valid files
            {
              name: 'UserService.js',
              path: 'src/services/UserService.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'AuthController.js',
              path: 'src/controllers/AuthController.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'utils.ts',
              path: 'src/utils/utils.ts',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            // Invalid - in ignored directories
            {
              name: 'index.js',
              path: 'node_modules/express/index.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'bundle.js',
              path: 'dist/bundle.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'test.js',
              path: '.git/hooks/test.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            // Invalid - ignored file names
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: '.env',
              path: '.env',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            // Invalid - ignored extensions
            {
              name: 'app.exe',
              path: 'bin/app.exe',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'data.log',
              path: 'logs/data.log',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['test'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/services/UserService.js',
            url: 'src/services/UserService.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/controllers/AuthController.js',
            url: 'src/controllers/AuthController.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/utils/utils.ts',
            url: 'src/utils/utils.ts',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: '.env',
            url: '.env',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should handle empty results after filtering', async () => {
      const mockResponse = {
        data: {
          total_count: 3,
          items: [
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'yarn.lock',
              path: 'yarn.lock',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'Cargo.lock',
              path: 'Cargo.lock',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['lock'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([]);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should correctly update total_count after filtering', async () => {
      const mockResponse = {
        data: {
          total_count: 100, // API returns 100 total matches
          items: [
            // Mix of valid and invalid files
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'test.js',
              path: 'node_modules/jest/test.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'config.js',
              path: 'src/config.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'bundle.js',
              path: 'dist/bundle.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
            {
              name: 'utils.js',
              path: 'src/utils.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await searchGitHubCodeAPI({
        researchSuggestions: [],
        keywordsToSearch: ['test'],
        owner: 'test',
        repo: 'repo',
        minify: true,
        sanitize: true,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([
          {
            path: 'src/app.js',
            url: 'src/app.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/config.js',
            url: 'src/config.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
          {
            path: 'src/utils.js',
            url: 'src/utils.js',
            repository: { nameWithOwner: 'test/repo', url: 'url' },
            matches: [],
          },
        ]);
      } else {
        expect.fail('Expected successful result');
      }
    });
  });
});
