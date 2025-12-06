import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PackageSearchQuerySchema } from '../../src/scheme/package_search.js';
import type { ToolInvocationCallback } from '../../src/types.js';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Mock axios (for Python/PyPI searches)
const mockAxiosGet = vi.fn();
vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => mockAxiosGet(...args),
    isAxiosError: (error: unknown) =>
      error &&
      typeof error === 'object' &&
      'isAxiosError' in error &&
      (error as { isAxiosError: boolean }).isAxiosError === true,
  },
}));

// Mock executeNpmCommand and checkNpmAvailability (for npm CLI searches)
const mockExecuteNpmCommand = vi.fn();
const mockCheckNpmAvailability = vi.fn();
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: (...args: unknown[]) => mockExecuteNpmCommand(...args),
  checkNpmAvailability: (...args: unknown[]) =>
    mockCheckNpmAvailability(...args),
}));

// Mock the cache to prevent interference
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
}));

// Mock toolMetadata
vi.mock('../../src/tools/toolMetadata.js', async () => {
  const actual = await vi.importActual('../../src/tools/toolMetadata.js');
  return {
    ...actual,
    TOOL_NAMES: {
      ...(actual as { TOOL_NAMES: Record<string, string> }).TOOL_NAMES,
      PACKAGE_SEARCH: 'packageSearch',
    },
    DESCRIPTIONS: {
      ...(actual as { DESCRIPTIONS: Record<string, string> }).DESCRIPTIONS,
      packageSearch: 'Search for packages in npm or Python ecosystems',
    },
  };
});

// Import after mocking
import {
  searchPackage,
  type PackageSearchInput,
} from '../../src/utils/package.js';
import { registerPackageSearchTool } from '../../src/tools/package_search.js';

describe('PackageSearchQuerySchema', () => {
  const withResearchFields = <T extends object>(query: T) => ({
    ...query,
    mainResearchGoal: 'Test research goal',
    researchGoal: 'Testing package search',
    reasoning: 'Unit test for schema',
  });

  describe('NPM ecosystem validation', () => {
    it('should validate NPM package query', () => {
      const query = withResearchFields({
        ecosystem: 'npm',
        name: 'axios',
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ecosystem).toBe('npm');
        expect(result.data.name).toBe('axios');
      }
    });

    it('should validate NPM query with searchLimit', () => {
      const query = withResearchFields({
        ecosystem: 'npm',
        name: 'lodash',
        searchLimit: 5,
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.searchLimit).toBe(5);
      }
    });

    it('should validate NPM query with npmFetchMetadata', () => {
      const query = withResearchFields({
        ecosystem: 'npm',
        name: 'react',
        npmFetchMetadata: true,
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success && result.data.ecosystem === 'npm') {
        expect(result.data.npmFetchMetadata).toBe(true);
      }
    });

    it('should reject empty package name', () => {
      const query = withResearchFields({
        ecosystem: 'npm',
        name: '',
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it('should reject searchLimit > 10', () => {
      const query = withResearchFields({
        ecosystem: 'npm',
        name: 'axios',
        searchLimit: 15,
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });

  describe('Python ecosystem validation', () => {
    it('should validate Python package query', () => {
      const query = withResearchFields({
        ecosystem: 'python',
        name: 'requests',
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ecosystem).toBe('python');
        expect(result.data.name).toBe('requests');
      }
    });

    it('should validate Python query with searchLimit', () => {
      const query = withResearchFields({
        ecosystem: 'python',
        name: 'numpy',
        searchLimit: 3,
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.searchLimit).toBe(3);
      }
    });
  });

  describe('Invalid ecosystem', () => {
    it('should reject invalid ecosystem', () => {
      const query = withResearchFields({
        ecosystem: 'invalid',
        name: 'test',
      });

      const result = PackageSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});

describe('searchPackage - NPM (CLI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return minimal NPM package results by default (name and repository only)', async () => {
    const mockCliOutput = JSON.stringify([
      {
        name: 'axios',
        version: '1.6.0',
        description: 'Promise based HTTP client for the browser and node.js',
        keywords: ['xhr', 'http', 'ajax', 'promise', 'node'],
        links: {
          repository: 'https://github.com/axios/axios',
          homepage: 'https://axios-http.com',
        },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('axios');
      expect(pkg.repository).toBe('https://github.com/axios/axios');
      // By default, should NOT have these fields
      expect('version' in pkg).toBe(false);
      expect('description' in pkg).toBe(false);
      expect('keywords' in pkg).toBe(false);
      expect(result.ecosystem).toBe('npm');
      expect(result.totalFound).toBe(1);
    }

    // Verify CLI was called with correct args
    expect(mockExecuteNpmCommand).toHaveBeenCalledWith('search', [
      'axios',
      '--json',
      '--searchlimit=1',
    ]);
  });

  it('should return full NPM package results when npmFetchMetadata is true', async () => {
    const mockCliOutput = JSON.stringify([
      {
        name: 'axios',
        version: '1.6.0',
        description: 'Promise based HTTP client for the browser and node.js',
        keywords: ['xhr', 'http', 'ajax', 'promise', 'node'],
        links: {
          repository: 'https://github.com/axios/axios',
          homepage: 'https://axios-http.com',
        },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('axios');
      expect(pkg.repository).toBe('https://github.com/axios/axios');
      // With npmFetchMetadata: true, should have full fields
      expect('version' in pkg).toBe(true);
      expect('description' in pkg).toBe(true);
      expect('keywords' in pkg).toBe(true);
      expect((pkg as { version: string }).version).toBe('1.6.0');
      expect(result.ecosystem).toBe('npm');
      expect(result.totalFound).toBe(1);
    }
  });

  it('should handle NPM CLI search with multiple results (minimal output)', async () => {
    const mockCliOutput = JSON.stringify([
      {
        name: 'lodash',
        version: '4.17.21',
        description: 'Lodash modular utilities',
        keywords: ['modules', 'stdlib', 'util'],
        links: { repository: 'https://github.com/lodash/lodash' },
      },
      {
        name: 'lodash-es',
        version: '4.17.21',
        description: 'Lodash exported as ES modules',
        keywords: ['es', 'modules'],
        links: { repository: 'https://github.com/lodash/lodash' },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'lodash',
      searchLimit: 5,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(2);
      expect(result.totalFound).toBe(2);
      // Both should have only name and repository
      expect('version' in result.packages[0]!).toBe(false);
    }

    // Verify searchLimit is passed
    expect(mockExecuteNpmCommand).toHaveBeenCalledWith('search', [
      'lodash',
      '--json',
      '--searchlimit=5',
    ]);
  });

  it('should truncate long descriptions when npmFetchMetadata is true', async () => {
    const longDescription = 'A'.repeat(300);
    const mockCliOutput = JSON.stringify([
      {
        name: 'test-package',
        version: '1.0.0',
        description: longDescription,
        keywords: [],
        links: {},
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'test-package',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0] as { description: string };
      expect(pkg.description!.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(pkg.description!.endsWith('...')).toBe(true);
    }
  });

  it('should handle NPM CLI command error', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: new Error('Command timeout'),
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Command timeout');
      expect(result.hints).toBeDefined();
    }
  });

  it('should handle NPM CLI non-zero exit code', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: 'npm ERR! code E404',
      exitCode: 1,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('NPM search failed');
    }
  });

  it('should handle invalid JSON output from CLI', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: 'not valid json',
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Failed to parse npm search output');
    }
  });

  it('should handle empty search results', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '[]',
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'nonexistent-package-xyz123',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(0);
      expect(result.totalFound).toBe(0);
    }
  });
});

describe('searchPackage - Python', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return minimal Python package results by default (name and repository only)', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'Python HTTP for Humans.',
          keywords: 'http,client,requests',
          license: 'Apache 2.0',
          author: 'Kenneth Reitz',
          home_page: 'https://requests.readthedocs.io',
          project_urls: {
            Source: 'https://github.com/psf/requests',
          },
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'requests',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('requests');
      expect(pkg.repository).toBe('https://github.com/psf/requests');
      // By default, should NOT have these fields
      expect('version' in pkg).toBe(false);
      expect('description' in pkg).toBe(false);
      expect('keywords' in pkg).toBe(false);
      expect(result.ecosystem).toBe('python');
      expect(result.totalFound).toBe(1);
    }
  });

  it('should return full Python package results when npmFetchMetadata is true', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'Python HTTP for Humans.',
          keywords: 'http,client,requests',
          license: 'Apache 2.0',
          author: 'Kenneth Reitz',
          home_page: 'https://requests.readthedocs.io',
          project_urls: {
            Source: 'https://github.com/psf/requests',
          },
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'requests',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('requests');
      expect(pkg.repository).toBe('https://github.com/psf/requests');
      // With npmFetchMetadata: true, should have full fields
      expect('version' in pkg).toBe(true);
      expect('description' in pkg).toBe(true);
      expect('keywords' in pkg).toBe(true);
      expect((pkg as { version: string }).version).toBe('2.31.0');
      expect(result.ecosystem).toBe('python');
      expect(result.totalFound).toBe(1);
    }
  });

  it('should extract repository from project_urls', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'numpy',
          version: '1.26.0',
          summary: 'Numerical Python',
          keywords: '',
          project_urls: {
            Repository: 'https://github.com/numpy/numpy',
            Homepage: 'https://numpy.org',
          },
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'numpy',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0]!;
      expect(pkg.repository).toBe('https://github.com/numpy/numpy');
    }
  });

  it('should handle Python package not found with empty result (consistent with NPM)', async () => {
    const axiosError = new Error('Not found') as unknown as {
      isAxiosError: boolean;
      response: { status: number };
      message: string;
    };
    axiosError.isAxiosError = true;
    axiosError.response = { status: 404 };

    mockAxiosGet.mockRejectedValue(axiosError);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'nonexistent-package-xyz',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    // Should return empty packages array (not error) - consistent with NPM behavior
    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages).toEqual([]);
      expect(result.ecosystem).toBe('python');
      expect(result.totalFound).toBe(0);
    }
  });

  it('should parse comma-separated keywords when npmFetchMetadata is true', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test package',
          keywords: 'http, client, api, rest',
          project_urls: {},
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0] as { keywords: string[] };
      expect(pkg.keywords.length).toBeGreaterThan(0);
      expect(pkg.keywords).toContain('http');
    }
  });

  it('should limit keywords to MAX_KEYWORDS when npmFetchMetadata is true', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test package',
          keywords: 'a,b,c,d,e,f,g,h,i,j,k,l,m,n,o',
          project_urls: {},
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0] as { keywords: string[] };
      expect(pkg.keywords.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('searchPackage - Name normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should normalize Python package name with underscores', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'some_package',
          version: '1.0.0',
          summary: 'Test package',
          keywords: '',
          project_urls: {},
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'some_package',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('some_package');
    }
  });
});

describe('searchPackage - NPM Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle non-array npm search response', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '{"notAnArray": true}',
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Invalid npm search response format');
    }
  });
});

describe('searchPackage - Python Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fallback to home_page for repository URL', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test package',
          keywords: '',
          project_urls: {}, // No project_urls with repo
          home_page: 'https://github.com/test/test-pkg', // But home_page has github
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0]!;
      expect(pkg.repository).toBe('https://github.com/test/test-pkg');
    }
  });

  it('should not use home_page if not a known repo host', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test package',
          keywords: '',
          project_urls: {},
          home_page: 'https://example.com/docs', // Not github/gitlab/bitbucket
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0]!;
      expect(pkg.repository).toBeNull();
    }
  });

  it('should handle keywords as array when npmFetchMetadata is true', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test package',
          keywords: ['keyword1', 'keyword2', 'keyword3'], // Array instead of string
          project_urls: {},
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0] as { keywords: string[] };
      expect(pkg.keywords).toEqual(['keyword1', 'keyword2', 'keyword3']);
    }
  });

  it('should truncate long Python description when npmFetchMetadata is true', async () => {
    const longDescription = 'B'.repeat(300);
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: longDescription,
          keywords: '',
          project_urls: {},
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0] as { description: string };
      expect(pkg.description!.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(pkg.description!.endsWith('...')).toBe(true);
    }
  });

  it('should re-throw non-404 errors', async () => {
    const networkError = new Error('Network error') as unknown as {
      isAxiosError: boolean;
      response?: { status: number };
      code?: string;
    };
    networkError.isAxiosError = true;
    // Not a 404 - should be re-thrown

    mockAxiosGet.mockRejectedValue(networkError);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    // This should throw and be caught by the outer error handler
    await expect(searchPackage(query)).rejects.toThrow();
  });

  it('should skip packages without info object', async () => {
    // First call returns no info, second call (with different name variation) succeeds
    mockAxiosGet
      .mockResolvedValueOnce({
        data: {}, // No info object
      })
      .mockResolvedValueOnce({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Found on second try',
            keywords: '',
            project_urls: {
              Source: 'https://github.com/test/test-pkg',
            },
          },
        },
      });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // By default (minimal), should have name and repository
      expect(result.packages[0]!.name).toBe('test-pkg');
      expect(result.packages[0]!.repository).toBe(
        'https://github.com/test/test-pkg'
      );
    }
  });

  it('should skip packages without info object and return description when npmFetchMetadata is true', async () => {
    // First call returns no info, second call (with different name variation) succeeds
    mockAxiosGet
      .mockResolvedValueOnce({
        data: {}, // No info object
      })
      .mockResolvedValueOnce({
        data: {
          info: {
            name: 'test-pkg',
            version: '1.0.0',
            summary: 'Found on second try',
            keywords: '',
            project_urls: {},
          },
        },
      });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0] as { description: string };
      expect(pkg.description).toBe('Found on second try');
    }
  });

  it('should extract repo from gitlab URL', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test',
          keywords: '',
          project_urls: {
            Repository: 'https://gitlab.com/test/repo',
          },
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages[0]!.repository).toBe(
        'https://gitlab.com/test/repo'
      );
    }
  });

  it('should extract repo from bitbucket URL', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test',
          keywords: '',
          project_urls: {
            Source: 'https://bitbucket.org/test/repo',
          },
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages[0]!.repository).toBe(
        'https://bitbucket.org/test/repo'
      );
    }
  });

  it('should extract repo from gitlab home_page', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test',
          keywords: '',
          project_urls: {},
          home_page: 'https://gitlab.com/test/repo',
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'test-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages[0]!.repository).toBe(
        'https://gitlab.com/test/repo'
      );
    }
  });
});

describe('Package search response structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosGet.mockReset();
    mockExecuteNpmCommand.mockReset();
  });

  it('should return minimal structure by default (name and repository only)', async () => {
    const mockCliOutput = JSON.stringify([
      {
        name: 'express',
        version: '4.18.2',
        description: 'Fast web framework',
        keywords: ['web', 'framework'],
        links: { repository: 'https://github.com/expressjs/express' },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'express',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    // Check if we got packages or error
    if ('error' in result) {
      // If error, fail with the error message for debugging
      expect(result.error).toBeUndefined();
    }

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // Verify structure
      expect(result).toHaveProperty('packages');
      expect(result).toHaveProperty('ecosystem');
      expect(result).toHaveProperty('totalFound');
      expect(Array.isArray(result.packages)).toBe(true);

      // Verify minimal package structure (only name and repository)
      const pkg = result.packages[0]!;
      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('repository');
      // Should NOT have these in minimal mode
      expect(pkg).not.toHaveProperty('version');
      expect(pkg).not.toHaveProperty('description');
      expect(pkg).not.toHaveProperty('keywords');
    }
  });

  it('should return full structure when npmFetchMetadata is true', async () => {
    const mockCliOutput = JSON.stringify([
      {
        name: 'express',
        version: '4.18.2',
        description: 'Fast web framework',
        keywords: ['web', 'framework'],
        links: { repository: 'https://github.com/expressjs/express' },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'express',
      npmFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // Verify full package structure
      const pkg = result.packages[0]!;
      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('version');
      expect(pkg).toHaveProperty('description');
      expect(pkg).toHaveProperty('keywords');
      expect(pkg).toHaveProperty('repository');
    }
  });

  it('should return proper structure for error response', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: new Error('Command failed'),
    });

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'test',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
      expect(result.hints).toBeDefined();
      expect(Array.isArray(result.hints)).toBe(true);
    }
  });
});

describe('registerPackageSearchTool', () => {
  let mockServer: MockMcpServer;
  let mockCallback: ReturnType<typeof vi.fn<ToolInvocationCallback>>;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    mockCallback = vi.fn<ToolInvocationCallback>().mockResolvedValue(undefined);
    vi.clearAllMocks();
    mockExecuteNpmCommand.mockReset();
    mockAxiosGet.mockReset();
    // Default: npm is available
    mockCheckNpmAvailability.mockResolvedValue(true);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register package_search tool with callback when npm is available', async () => {
      mockCheckNpmAvailability.mockResolvedValue(true);
      await registerPackageSearchTool(mockServer.server, mockCallback);
      expect(mockServer.server.registerTool).toHaveBeenCalled();
    });

    it('should register package_search tool without callback when npm is available', async () => {
      mockCheckNpmAvailability.mockResolvedValue(true);
      await registerPackageSearchTool(mockServer.server);
      expect(mockServer.server.registerTool).toHaveBeenCalled();
    });

    it('should register with undefined callback when npm is available', async () => {
      mockCheckNpmAvailability.mockResolvedValue(true);
      await registerPackageSearchTool(mockServer.server, undefined);
      expect(mockServer.server.registerTool).toHaveBeenCalled();
    });

    it('should NOT register tool when npm ping fails', async () => {
      mockCheckNpmAvailability.mockResolvedValue(false);
      const result = await registerPackageSearchTool(
        mockServer.server,
        mockCallback
      );
      expect(result).toBeNull();
      expect(mockServer.server.registerTool).not.toHaveBeenCalled();
    });

    it('should NOT register tool when npm ping times out', async () => {
      mockCheckNpmAvailability.mockResolvedValue(false);
      const result = await registerPackageSearchTool(mockServer.server);
      expect(result).toBeNull();
      expect(mockServer.server.registerTool).not.toHaveBeenCalled();
    });

    it('should call checkNpmAvailability with 10 second timeout', async () => {
      mockCheckNpmAvailability.mockResolvedValue(true);
      await registerPackageSearchTool(mockServer.server);
      expect(mockCheckNpmAvailability).toHaveBeenCalledWith(10000);
    });
  });

  describe('Tool Execution - NPM', () => {
    it('should execute npm package search and return results', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'axios',
          version: '1.6.0',
          description: 'HTTP client',
          keywords: ['http'],
          links: { repository: 'https://github.com/axios/axios' },
        },
      ]);

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server, mockCallback);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'axios',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should include repository hint for packages with repo links', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'react',
          version: '18.0.0',
          description: 'React library',
          keywords: ['ui'],
          links: { repository: 'https://github.com/facebook/react' },
        },
      ]);

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'react',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('GitHub tools');
    });

    it('should include npm ecosystem hint', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'lodash',
          version: '4.17.21',
          description: 'Utility library',
          keywords: [],
          links: {},
        },
      ]);

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'lodash',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('package.json');
    });

    it('should generate empty hints for no results (npm)', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'nonexistent-pkg-xyz',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('npmjs.com');
    });
  });

  describe('Tool Execution - Python', () => {
    it('should execute python package search and return results', async () => {
      const mockPyPIResponse = {
        data: {
          info: {
            name: 'requests',
            version: '2.31.0',
            summary: 'HTTP library',
            keywords: 'http',
            project_urls: {
              Source: 'https://github.com/psf/requests',
            },
          },
        },
      };

      mockAxiosGet.mockResolvedValue(mockPyPIResponse);

      await registerPackageSearchTool(mockServer.server, mockCallback);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'python',
            name: 'requests',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
    });

    it('should include python ecosystem hint', async () => {
      const mockPyPIResponse = {
        data: {
          info: {
            name: 'numpy',
            version: '1.26.0',
            summary: 'Numerical Python',
            keywords: '',
            project_urls: {},
          },
        },
      };

      mockAxiosGet.mockResolvedValue(mockPyPIResponse);

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'python',
            name: 'numpy',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('requirements.txt');
    });

    it('should generate empty hints for not found (python)', async () => {
      const axiosError = new Error('Not found') as unknown as {
        isAxiosError: boolean;
        response: { status: number };
      };
      axiosError.isAxiosError = true;
      axiosError.response = { status: 404 };

      mockAxiosGet.mockRejectedValue(axiosError);

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'python',
            name: 'nonexistent-pkg-xyz',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;
      // The response contains either error message or empty status hints
      expect(text).toMatch(/not found|No python packages found/);
    });
  });

  describe('Callback Invocation', () => {
    it('should invoke callback with tool name and queries', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server, mockCallback);

      const queries = [
        {
          ecosystem: 'npm' as const,
          name: 'test-pkg',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ];

      await mockServer.callTool('packageSearch', { queries });

      expect(mockCallback).toHaveBeenCalledWith('packageSearch', queries);
    });

    it('should continue execution even if callback throws', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      mockCallback.mockRejectedValue(new Error('Callback error'));

      await registerPackageSearchTool(mockServer.server, mockCallback);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'test-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      // Should still return results despite callback error
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should not invoke callback if none provided', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server); // No callback

      await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'test-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Bulk Operations', () => {
    it('should handle multiple queries in bulk', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: JSON.stringify([{ name: 'pkg', version: '1.0.0' }]),
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'pkg1',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
          {
            ecosystem: 'npm',
            name: 'pkg2',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(result.content).toBeDefined();
      // Should have been called twice (once per query)
      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(2);
    });

    it('should handle empty queries array', async () => {
      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [],
      });

      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle search errors gracefully', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '',
        stderr: '',
        error: new Error('Network error'),
      });

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'test-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(result.content).toBeDefined();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('error');
    });

    it('should handle unexpected errors', async () => {
      mockExecuteNpmCommand.mockRejectedValue(new Error('Unexpected error'));

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'test-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('Catch Error Handling', () => {
    it('should handle thrown errors via handleCatchError (line 115)', async () => {
      // Non-404 errors are re-thrown and caught by handleCatchError
      const networkError = new Error('Connection refused') as unknown as {
        isAxiosError: boolean;
        response?: { status: number };
      };
      networkError.isAxiosError = true;
      // No response.status = not a 404, will be re-thrown

      mockAxiosGet.mockRejectedValue(networkError);

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'python',
            name: 'test-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      expect(result.content).toBeDefined();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('error');
    });
  });

  describe('Success Hints Generation', () => {
    it('should not include repo hint when packages have no repository', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'no-repo-pkg',
          version: '1.0.0',
          description: 'Package without repo',
          keywords: [],
          links: {}, // No repository
        },
      ]);

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      });

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'no-repo-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;
      // Should have npm hint but NOT the repository hint
      expect(text).toContain('package.json');
      expect(text).not.toContain('GitHub tools');
    });
  });
});
