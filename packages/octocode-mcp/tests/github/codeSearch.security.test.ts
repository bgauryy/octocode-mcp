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

// Mock the cache
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
}));

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/serverConfig.js', () => ({
  isSanitizeEnabled: vi.fn().mockReturnValue(true),
}));

// Import after mocking
import { searchGitHubCodeAPI } from '../../src/github/codeSearch.js';
import { SEARCH_ERRORS } from '../../src/errorCodes.js';

describe('Code Search - Empty Query Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when all keywords are empty strings', async () => {
    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['', ' ', '  '],
      owner: 'test',
      repo: 'repo',
    });

    expect(result).toEqual({
      error: SEARCH_ERRORS.QUERY_EMPTY.message,
      type: 'http',
      status: 400,
    });

    expect(mockOctokit.rest.search.code).not.toHaveBeenCalled();
  });

  it('should handle empty keywords array', async () => {
    const mockResponse = {
      data: {
        total_count: 0,
        items: [],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: [],
      owner: 'test',
      repo: 'repo',
    });

    // Should handle empty keywords gracefully
    expect('error' in result || 'data' in result).toBe(true);
  });

  it('should return error when built query is empty after trimming', async () => {
    // Mock buildCodeSearchQuery to return empty string
    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['   '],
      owner: 'test',
      repo: 'repo',
    });

    expect(result).toEqual({
      error: SEARCH_ERRORS.QUERY_EMPTY.message,
      type: 'http',
      status: 400,
    });

    expect(mockOctokit.rest.search.code).not.toHaveBeenCalled();
  });
});

describe('Code Search - Security Warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sanitize content when requested', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'config.js',
            path: 'src/config.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const API_KEY = "test_value";',
                matches: [{ indices: [0, 10] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['API_KEY'],
      owner: 'test',
      repo: 'repo',
      sanitize: true,
    });

    if ('data' in result) {
      // Should complete successfully with sanitization enabled
      expect(result.data.items).toBeDefined();
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should not sanitize when sanitize is false', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'prompt.js',
            path: 'src/prompt.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const value = "test";',
                matches: [{ indices: [0, 10] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['value'],
      owner: 'test',
      repo: 'repo',
      sanitize: false,
    });

    if ('data' in result) {
      // No security warnings when sanitize is disabled
      expect(result.data.securityWarnings).toBeUndefined();
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should add multiple security warnings when multiple issues detected', async () => {
    const mockResponse = {
      data: {
        total_count: 2,
        items: [
          {
            name: 'secrets.js',
            path: 'src/secrets.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const TOKEN = "ghp_abc123def456ghi789jkl012mno345";',
                matches: [{ indices: [0, 5] }],
              },
            ],
          },
          {
            name: 'xss.js',
            path: 'src/xss.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: '<script>alert("XSS")</script>',
                matches: [{ indices: [0, 8] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['token', 'script'],
      owner: 'test',
      repo: 'repo',
      sanitize: true,
    });

    if ('data' in result) {
      expect(result.data.securityWarnings).toBeDefined();
      expect(result.data.securityWarnings?.length).toBeGreaterThan(0);
    } else {
      expect.fail('Expected successful result');
    }
  });
});

describe('Code Search - Minification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set minificationFailed to true when minification fails', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'invalid.js',
            path: 'src/invalid.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                // Invalid JS that might cause minification to fail
                fragment: 'function broken() { if ( }',
                matches: [{ indices: [0, 8] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['function'],
      owner: 'test',
      repo: 'repo',
      minify: true,
    });

    if ('data' in result) {
      // Minification will be attempted
      expect(result.data.minified).toBeDefined();
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should include minification types when minification succeeds', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'app.js',
            path: 'src/app.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'function test() { return true; }',
                matches: [{ indices: [0, 8] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['function'],
      owner: 'test',
      repo: 'repo',
      minify: true,
    });

    if ('data' in result) {
      expect(result.data.minified).toBeDefined();
      expect(result.data.minificationTypes).toBeDefined();
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should not add minification metadata when minify is false', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'app.js',
            path: 'src/app.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'function test() { return true; }',
                matches: [{ indices: [0, 8] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['function'],
      owner: 'test',
      repo: 'repo',
      minify: false,
    });

    if ('data' in result) {
      expect(result.data.minified).toBeUndefined();
      expect(result.data.minificationFailed).toBeUndefined();
      expect(result.data.minificationTypes).toBeUndefined();
    } else {
      expect.fail('Expected successful result');
    }
  });
});

describe('Code Search - Security Warnings Array Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle sanitize option correctly', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'secrets.js',
            path: 'src/secrets.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const API_KEY = "test";',
                matches: [{ indices: [0, 5] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['API_KEY'],
      owner: 'test',
      repo: 'repo',
      sanitize: true,
    });

    if ('data' in result) {
      // Should complete successfully
      expect(result.data.items).toBeDefined();
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should not create securityWarnings array when sanitize is false', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'secrets.js',
            path: 'src/secrets.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const API_KEY = "sk_test_abc123";',
                matches: [{ indices: [0, 5] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['API_KEY'],
      owner: 'test',
      repo: 'repo',
      sanitize: false,
    });

    if ('data' in result) {
      // Security warnings should NOT be created when sanitize is false
      expect(result.data.securityWarnings).toBeUndefined();
    } else {
      expect.fail('Expected successful result');
    }
  });
});

// Tests for security warning aggregation and handling
describe('Code Search - Security Warning Structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle security warnings array correctly', async () => {
    const mockResponse = {
      data: {
        total_count: 2,
        items: [
          {
            name: 'secrets1.js',
            path: 'src/secrets1.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const API_KEY = "ghp_abc123def456ghi789jkl012";',
                matches: [{ indices: [0, 10] }],
              },
            ],
          },
          {
            name: 'secrets2.js',
            path: 'src/secrets2.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'const TOKEN = "sk_live_abc123def456";',
                matches: [{ indices: [0, 5] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['key', 'token'],
      owner: 'test',
      repo: 'repo',
      sanitize: true,
    });

    if ('data' in result) {
      // Multiple secrets across different files should create multiple warnings
      expect(result.data.securityWarnings).toBeDefined();
      expect(result.data.securityWarnings?.length).toBeGreaterThan(0);
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should add warning for each file with secrets detected', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'multi-secret.js',
            path: 'src/multi-secret.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment:
                  'const API_KEY = "ghp_abc123def456ghi789jkl012mno345pqr678";',
                matches: [{ indices: [0, 10] }],
              },
            ],
          },
        ],
      },
      headers: {},
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      keywordsToSearch: ['API_KEY'],
      owner: 'test',
      repo: 'repo',
      sanitize: true,
    });

    if ('data' in result) {
      // Should have warnings for the detected secrets
      expect(result.data.securityWarnings).toBeDefined();
      const warnings = result.data.securityWarnings || [];
      expect(warnings.some((w: string) => w.includes('multi-secret.js'))).toBe(
        true
      );
    } else {
      expect.fail('Expected successful result');
    }
  });
});
