import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PackageSearchQuerySchema } from '../../src/scheme/package_search.js';
import { resetPyPICache } from '../../src/utils/package.js';
import type { ToolInvocationCallback } from '../../src/types.js';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Mock axios (for Python/PyPI searches and npm registry)
const mockAxiosGet = vi.fn();

// Store for npm registry responses (package name -> repository URL)
const npmRegistryResponses: Map<string, string> = new Map();

// Helper to set npm registry mock for a package
function mockNpmRegistry(packageName: string, repoUrl: string): void {
  npmRegistryResponses.set(packageName, repoUrl);
}

// Helper to clear npm registry mocks
function clearNpmRegistryMocks(): void {
  npmRegistryResponses.clear();
}

vi.mock('axios', () => ({
  default: {
    get: (url: string, ...args: unknown[]) => {
      // Handle npm registry calls
      if (typeof url === 'string' && url.includes('registry.npmjs.org')) {
        const packageName = url.split('/').pop() || '';
        const repoUrl = npmRegistryResponses.get(
          decodeURIComponent(packageName)
        );
        if (repoUrl) {
          return Promise.resolve({
            data: {
              repository: {
                url: repoUrl,
              },
            },
          });
        }
        // Return empty repository if not mocked
        return Promise.resolve({ data: {} });
      }
      // For all other URLs (PyPI, etc.), use the regular mock
      return mockAxiosGet(url, ...args);
    },
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
    clearNpmRegistryMocks();
  });

  it('should return minimal NPM package results by default (name and repository only)', async () => {
    const mockCliOutput = JSON.stringify([
      {
        name: 'axios',
        version: '1.6.0',
        description: 'Promise based HTTP client for the browser and node.js',
        keywords: ['xhr', 'http', 'ajax', 'promise', 'node'],
        links: {
          homepage: 'https://axios-http.com',
        },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    // Mock npm registry API for repository URL (Bug #1 fix)
    mockNpmRegistry('axios', 'git+https://github.com/axios/axios.git');

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
          homepage: 'https://axios-http.com',
        },
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    // Mock npm registry API for repository URL (Bug #1 fix)
    mockNpmRegistry('axios', 'git+https://github.com/axios/axios.git');

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
      },
      {
        name: 'lodash-es',
        version: '4.17.21',
        description: 'Lodash exported as ES modules',
        keywords: ['es', 'modules'],
      },
    ]);

    mockExecuteNpmCommand.mockResolvedValue({
      stdout: mockCliOutput,
      stderr: '',
      exitCode: 0,
    });

    // Mock npm registry API for repository URLs (Bug #1 fix)
    mockNpmRegistry('lodash', 'git+https://github.com/lodash/lodash.git');
    mockNpmRegistry('lodash-es', 'git+https://github.com/lodash/lodash.git');

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
    resetPyPICache(); // Bug #2 fix: Reset cache to prevent test pollution
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

  it('should return full Python package results when pythonFetchMetadata is true', async () => {
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
      pythonFetchMetadata: true,
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
      // With pythonFetchMetadata: true, should have full fields
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

  it('should parse comma-separated keywords when pythonFetchMetadata is true', async () => {
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
      pythonFetchMetadata: true,
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

  it('should limit keywords to MAX_KEYWORDS when pythonFetchMetadata is true', async () => {
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
      pythonFetchMetadata: true,
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
    clearNpmRegistryMocks();
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
    resetPyPICache(); // Bug #2 fix: Reset cache to prevent test pollution
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

  it('should handle keywords as array when pythonFetchMetadata is true', async () => {
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
      pythonFetchMetadata: true,
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

  it('should truncate long Python description when pythonFetchMetadata is true', async () => {
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
      pythonFetchMetadata: true,
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

  it('should skip packages without info object and return description when pythonFetchMetadata is true', async () => {
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
      pythonFetchMetadata: true,
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
    clearNpmRegistryMocks();
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
    clearNpmRegistryMocks();
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

    it('should include actionable GitHub hint for packages with repo links', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'react',
          version: '18.0.0',
          description: 'React library',
          keywords: ['ui'],
        },
      ]);

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      });

      // Mock npm registry API for repository URL (Bug #1 fix)
      mockNpmRegistry('react', 'git+https://github.com/facebook/react.git');

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
      expect(text).toContain('githubViewRepoStructure');
      expect(text).toContain('facebook');
    });

    it('should include install hint for npm packages', async () => {
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
      expect(text).toContain('Install: npm install lodash');
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

    it('should include install hint for python packages', async () => {
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
      expect(text).toContain('Install: pip install numpy');
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
      // Should have been called 4 times: 2 searches + 2 deprecation checks
      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(4);
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
      // Should have install hint but NOT the githubViewRepoStructure hint (no repo)
      expect(text).toContain('Install: npm install');
      expect(text).not.toContain('githubViewRepoStructure');
    });
  });

  describe('Custom Hints in Response', () => {
    it('should return hasResultsStatusHints with actionable GitHub and install hints for npm packages with repo', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'axios',
          version: '1.6.0',
          description: 'HTTP client',
          keywords: ['http'],
        },
      ]);

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      });

      // Mock npm registry API for repository URL (Bug #1 fix)
      mockNpmRegistry('axios', 'git+https://github.com/axios/axios.git');

      await registerPackageSearchTool(mockServer.server);

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

      const text = (result.content[0] as { text: string }).text;

      // Response is YAML format - verify hasResultsStatusHints section
      expect(text).toContain('hasResultsStatusHints');
      expect(text).toContain('githubViewRepoStructure');
      expect(text).toContain('Install: npm install axios');

      // Verify result status (YAML format uses quoted strings)
      expect(text).toContain('status: "hasResults"');
    });

    it('should return hasResultsStatusHints with only install hint when package has no repository', async () => {
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

      // Response is YAML format - verify hasResultsStatusHints section
      expect(text).toContain('hasResultsStatusHints');
      expect(text).toContain('Install: npm install no-repo-pkg');
      expect(text).not.toContain('githubViewRepoStructure');

      // Verify result status (YAML format uses quoted strings)
      expect(text).toContain('status: "hasResults"');
    });

    it('should return hasResultsStatusHints with actionable GitHub and install hints for python packages with repo', async () => {
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

      await registerPackageSearchTool(mockServer.server);

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

      const text = (result.content[0] as { text: string }).text;

      // Response is YAML format - verify hasResultsStatusHints section
      expect(text).toContain('hasResultsStatusHints');
      expect(text).toContain('githubViewRepoStructure');
      expect(text).toContain('Install: pip install requests');

      // Verify result status (YAML format uses quoted strings)
      expect(text).toContain('status: "hasResults"');
    });

    it('should return hasResultsStatusHints with only install hint when python package has no repository', async () => {
      const mockPyPIResponse = {
        data: {
          info: {
            name: 'no-repo-pkg',
            version: '1.0.0',
            summary: 'Package without repo',
            keywords: '',
            project_urls: {}, // No repository
          },
        },
      };

      mockAxiosGet.mockResolvedValue(mockPyPIResponse);

      await registerPackageSearchTool(mockServer.server);

      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'python',
            name: 'no-repo-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;

      // Response is YAML format - verify hasResultsStatusHints section
      expect(text).toContain('hasResultsStatusHints');
      expect(text).toContain('Install: pip install no-repo-pkg');
      expect(text).not.toContain('githubViewRepoStructure');

      // Verify result status (YAML format uses quoted strings)
      expect(text).toContain('status: "hasResults"');
    });

    it('should return emptyStatusHints with browse link when no npm packages found', async () => {
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
            name: 'nonexistent-pkg-xyz123',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;

      // Response is YAML format - verify emptyStatusHints section
      expect(text).toContain('emptyStatusHints');
      expect(text).toContain(
        "No npm packages found for 'nonexistent-pkg-xyz123'"
      );
      expect(text).toContain(
        'Browse: https://npmjs.com/search?q=nonexistent-pkg-xyz123'
      );

      // Verify result status (YAML format uses quoted strings)
      expect(text).toContain('status: "empty"');
    });

    it('should return emptyStatusHints with browse link when no python packages found', async () => {
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
            name: 'nonexistent-pkg-xyz123',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;

      // Response is YAML format - verify emptyStatusHints section
      expect(text).toContain('emptyStatusHints');
      expect(text).toContain(
        "No python packages found for 'nonexistent-pkg-xyz123'"
      );
      expect(text).toContain(
        'Browse: https://pypi.org/search/?q=nonexistent-pkg-xyz123'
      );

      // Verify result status (YAML format uses quoted strings)
      expect(text).toContain('status: "empty"');
    });

    it('should include both hasResultsStatusHints and emptyStatusHints in bulk operation results', async () => {
      const mockCliOutput = JSON.stringify([
        {
          name: 'react',
          version: '18.0.0',
          description: 'React library',
          keywords: ['ui'],
        },
      ]);

      // Mock npm registry API for repository URL (Bug #1 fix)
      mockNpmRegistry('react', 'git+https://github.com/facebook/react.git');

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          stdout: mockCliOutput,
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '[]', // Empty result for second query
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
          {
            ecosystem: 'npm',
            name: 'nonexistent-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const text = (result.content[0] as { text: string }).text;

      // Bulk response should have both hasResultsStatusHints and emptyStatusHints
      expect(text).toContain('hasResultsStatusHints');
      expect(text).toContain('emptyStatusHints');

      // hasResultsStatusHints should contain actionable hints
      expect(text).toContain('githubViewRepoStructure');
      expect(text).toContain('Install: npm install react');

      // emptyStatusHints should contain empty hints
      expect(text).toContain("No npm packages found for 'nonexistent-pkg'");
      expect(text).toContain(
        'Browse: https://npmjs.com/search?q=nonexistent-pkg'
      );
    });

    it('should generate correct hints based on generateSuccessHints for mixed ecosystems', async () => {
      const mockNpmOutput = JSON.stringify([
        {
          name: 'lodash',
          version: '4.17.21',
          description: 'Utility library',
          keywords: [],
        },
      ]);

      const mockPyPIResponse = {
        data: {
          info: {
            name: 'numpy',
            version: '1.26.0',
            summary: 'Numerical Python',
            keywords: '',
            project_urls: {
              Repository: 'https://github.com/numpy/numpy',
            },
          },
        },
      };

      mockExecuteNpmCommand.mockResolvedValue({
        stdout: mockNpmOutput,
        stderr: '',
        exitCode: 0,
      });

      // Mock npm registry API for repository URL (Bug #1 fix)
      mockNpmRegistry('lodash', 'git+https://github.com/lodash/lodash.git');

      mockAxiosGet.mockResolvedValue(mockPyPIResponse);

      await registerPackageSearchTool(mockServer.server);

      // Test npm ecosystem hints
      const npmResult = await mockServer.callTool('packageSearch', {
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

      const npmText = (npmResult.content[0] as { text: string }).text;
      expect(npmText).toContain('Install: npm install lodash');
      expect(npmText).toContain('githubViewRepoStructure');

      // Test python ecosystem hints
      const pythonResult = await mockServer.callTool('packageSearch', {
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

      const pythonText = (pythonResult.content[0] as { text: string }).text;
      expect(pythonText).toContain('Install: pip install numpy');
      expect(pythonText).toContain('githubViewRepoStructure');
    });

    it('should generate correct hints based on generateEmptyHints for mixed ecosystems', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      const axiosError = new Error('Not found') as unknown as {
        isAxiosError: boolean;
        response: { status: number };
      };
      axiosError.isAxiosError = true;
      axiosError.response = { status: 404 };
      mockAxiosGet.mockRejectedValue(axiosError);

      await registerPackageSearchTool(mockServer.server);

      // Test npm empty hints
      const npmResult = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'nonexistent-npm-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const npmText = (npmResult.content[0] as { text: string }).text;
      expect(npmText).toContain(
        "No npm packages found for 'nonexistent-npm-pkg'"
      );
      expect(npmText).toContain(
        'Browse: https://npmjs.com/search?q=nonexistent-npm-pkg'
      );
      expect(npmText).not.toContain('pypi.org');

      // Test python empty hints
      const pythonResult = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'python',
            name: 'nonexistent-python-pkg',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const pythonText = (pythonResult.content[0] as { text: string }).text;
      expect(pythonText).toContain(
        "No python packages found for 'nonexistent-python-pkg'"
      );
      expect(pythonText).toContain(
        'Browse: https://pypi.org/search/?q=nonexistent-python-pkg'
      );
      expect(pythonText).not.toContain('npmjs.com');
    });
  });
});

// ============================================
// NEW TESTS: Task 1 - Enhanced GitHub Integration Hints
// ============================================
describe('Task 1: Enhanced GitHub Integration Hints', () => {
  let mockServer: MockMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearNpmRegistryMocks();
    mockCheckNpmAvailability.mockResolvedValue(true);
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  it('should generate actionable GitHub tool call hints for npm packages', async () => {
    const mockNpmOutput = JSON.stringify([
      {
        name: 'axios',
        version: '1.6.0',
        description: 'HTTP client',
        keywords: [],
      },
    ]);

    // Mock npm registry API for repository URL (Bug #1 fix)
    mockNpmRegistry('axios', 'git+https://github.com/axios/axios.git');

    // Mock both search and deprecation check
    mockExecuteNpmCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'search') {
        return Promise.resolve({
          stdout: mockNpmOutput,
          stderr: '',
          exitCode: 0,
        });
      }
      if (cmd === 'view' && args.includes('deprecated')) {
        return Promise.resolve({
          stdout: 'undefined',
          stderr: '',
          exitCode: 0,
        });
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });

    await registerPackageSearchTool(mockServer.server);

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

    const text = (result.content[0] as { text: string }).text;
    // YAML uses escaped quotes, check for pattern
    expect(text).toContain('githubViewRepoStructure');
    expect(text).toContain('axios');
    expect(text).toContain('Install: npm install axios');
  });

  it('should generate actionable GitHub tool call hints for Python packages', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'HTTP library',
          keywords: '',
          project_urls: {
            Source: 'https://github.com/psf/requests',
          },
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    await registerPackageSearchTool(mockServer.server);

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

    const text = (result.content[0] as { text: string }).text;
    // YAML uses escaped quotes, so check for the pattern with either format
    expect(text).toContain('githubViewRepoStructure');
    expect(text).toContain('owner=');
    expect(text).toContain('psf');
    expect(text).toContain('Install: pip install requests');
  });

  it('should clean .git suffix from GitHub repository URLs', async () => {
    const mockNpmOutput = JSON.stringify([
      {
        name: 'lodash',
        version: '4.17.21',
        description: 'Utility library',
        keywords: [],
      },
    ]);

    // Mock npm registry API for repository URL with .git suffix (Bug #1 fix)
    // The code should strip the .git suffix
    mockNpmRegistry('lodash', 'git+https://github.com/lodash/lodash.git');

    // Mock deprecation check to return not deprecated
    mockExecuteNpmCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'search') {
        return Promise.resolve({
          stdout: mockNpmOutput,
          stderr: '',
          exitCode: 0,
        });
      }
      if (cmd === 'view' && args.includes('deprecated')) {
        return Promise.resolve({
          stdout: 'undefined',
          stderr: '',
          exitCode: 0,
        });
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
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
    // YAML uses escaped quotes, so check for the pattern
    expect(text).toContain('githubViewRepoStructure');
    expect(text).toContain('lodash');
    // Make sure .git is stripped from the repo name in the hint
    expect(text).not.toContain('repo="lodash.git"');
    expect(text).not.toContain("repo='lodash.git'");
  });
});

// ============================================
// NEW TESTS: Task 2 - Name Variation Suggestions
// ============================================
describe('Task 2: Name Variation Suggestions', () => {
  let mockServer: MockMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckNpmAvailability.mockResolvedValue(true);
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  it('should suggest name variations with hyphens converted to underscores', async () => {
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
          name: 'date-fns',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Try: date_fns');
    expect(text).toContain('datefns');
  });

  it('should suggest name variations with underscores converted to hyphens for Python', async () => {
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
          name: 'scikit_learn',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Try: scikit-learn');
  });

  it('should suggest unscoped name for @scope/name packages', async () => {
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
          name: '@types/node',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Try: node');
  });

  it('should suggest js suffix for npm packages', async () => {
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
          name: 'chart',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('chartjs');
  });

  it('should suggest py prefix for Python packages', async () => {
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
          name: 'test',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('pytest');
  });
});

// ============================================
// NEW TESTS: Task 3 - Deprecation Detection
// ============================================
describe('Task 3: Deprecation Detection', () => {
  let mockServer: MockMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckNpmAvailability.mockResolvedValue(true);
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  it('should show deprecation warning for deprecated npm packages', async () => {
    const mockSearchOutput = JSON.stringify([
      {
        name: 'request',
        version: '2.88.2',
        description: 'Simplified HTTP request client',
        keywords: [],
        links: { repository: 'https://github.com/request/request' },
      },
    ]);

    // Mock search command
    mockExecuteNpmCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'search') {
        return Promise.resolve({
          stdout: mockSearchOutput,
          stderr: '',
          exitCode: 0,
        });
      }
      if (cmd === 'view' && args.includes('deprecated')) {
        return Promise.resolve({
          stdout: '"request has been deprecated"',
          stderr: '',
          exitCode: 0,
        });
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });

    await registerPackageSearchTool(mockServer.server);

    const result = await mockServer.callTool('packageSearch', {
      queries: [
        {
          ecosystem: 'npm',
          name: 'request',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('DEPRECATED: request');
    expect(text).toContain('request has been deprecated');
  });

  it('should not show deprecation warning for non-deprecated packages', async () => {
    const mockSearchOutput = JSON.stringify([
      {
        name: 'lodash',
        version: '4.17.21',
        description: 'Utility library',
        keywords: [],
        links: { repository: 'https://github.com/lodash/lodash' },
      },
    ]);

    mockExecuteNpmCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'search') {
        return Promise.resolve({
          stdout: mockSearchOutput,
          stderr: '',
          exitCode: 0,
        });
      }
      if (cmd === 'view' && args.includes('deprecated')) {
        return Promise.resolve({
          stdout: 'undefined',
          stderr: '',
          exitCode: 0,
        });
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
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
    expect(text).not.toContain('DEPRECATED');
  });
});

// ============================================
// NEW TESTS: Task 4 - pythonFetchMetadata Parameter
// ============================================
describe('Task 4: pythonFetchMetadata Parameter', () => {
  const withResearchFields = <T extends object>(query: T) => ({
    ...query,
    mainResearchGoal: 'Test research goal',
    researchGoal: 'Testing package search',
    reasoning: 'Unit test for schema',
  });

  it('should validate Python query with pythonFetchMetadata', () => {
    const query = withResearchFields({
      ecosystem: 'python',
      name: 'requests',
      pythonFetchMetadata: true,
    });

    const result = PackageSearchQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
    if (result.success && result.data.ecosystem === 'python') {
      expect(result.data.pythonFetchMetadata).toBe(true);
    }
  });

  it('should default pythonFetchMetadata to false', () => {
    const query = withResearchFields({
      ecosystem: 'python',
      name: 'requests',
    });

    const result = PackageSearchQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
    if (result.success && result.data.ecosystem === 'python') {
      expect(result.data.pythonFetchMetadata).toBe(false);
    }
  });

  it('should return minimal Python package results by default', async () => {
    vi.clearAllMocks();

    const mockPyPIResponse = {
      data: {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'HTTP library',
          keywords: 'http client web',
          author: 'Kenneth Reitz',
          license: 'Apache 2.0',
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
      pythonFetchMetadata: false,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('requests');
      expect(pkg.repository).toBe('https://github.com/psf/requests');
      // Should NOT have full metadata fields
      expect('version' in pkg).toBe(false);
      expect('description' in pkg).toBe(false);
      expect('author' in pkg).toBe(false);
    }
  });

  it('should return full Python package results when pythonFetchMetadata is true', async () => {
    vi.clearAllMocks();

    const mockPyPIResponse = {
      data: {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'HTTP library',
          keywords: 'http client web',
          author: 'Kenneth Reitz',
          license: 'Apache 2.0',
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
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      const pkg = result.packages[0]!;
      expect(pkg.name).toBe('requests');
      expect('version' in pkg).toBe(true);
      expect('description' in pkg).toBe(true);
      expect('author' in pkg).toBe(true);
      expect((pkg as { version: string }).version).toBe('2.31.0');
      expect((pkg as { author: string }).author).toBe('Kenneth Reitz');
    }
  });
});

// ============================================
// NEW TESTS: Task 5 - PyPI Fuzzy Search
// ============================================
describe('Task 5: PyPI Fuzzy Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPyPICache(); // Bug #2 fix: Reset cache to prevent test pollution
  });

  it('should use fuzzy search when searchLimit > 1 for Python', async () => {
    // Mock Simple API response
    const mockSimpleResponse = {
      data: {
        projects: [
          { name: 'requests' },
          { name: 'requests-toolbelt' },
          { name: 'requests-mock' },
          { name: 'requests-cache' },
        ],
      },
    };

    // Mock individual package details
    const mockPackageDetail = (name: string) => ({
      data: {
        info: {
          name,
          version: '1.0.0',
          summary: `${name} description`,
          keywords: '',
          project_urls: {
            Source: `https://github.com/test/${name}`,
          },
        },
      },
    });

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      // Extract package name from URL
      const match = url.match(/\/pypi\/([^/]+)\/json/);
      if (match && match[1]) {
        return Promise.resolve(mockPackageDetail(match[1]));
      }
      return Promise.reject(new Error('Not found'));
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'request',
      searchLimit: 3,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(3);
      expect(result.packages.map(p => p.name)).toContain('requests');
    }
  });

  it('should fall back to exact match if fuzzy search fails', async () => {
    // Mock Simple API to fail
    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.reject(new Error('Network error'));
      }
      // Return valid response for exact match
      return Promise.resolve({
        data: {
          info: {
            name: 'requests',
            version: '2.31.0',
            summary: 'HTTP library',
            keywords: '',
            project_urls: {
              Source: 'https://github.com/psf/requests',
            },
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'requests',
      searchLimit: 3,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // Should fall back to exact match (which returns 1 result)
      expect(result.packages.length).toBeGreaterThanOrEqual(1);
      expect(result.packages[0]!.name).toBe('requests');
    }
  });

  it('should use exact match when searchLimit is 1 for Python', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'HTTP library',
          keywords: '',
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
      searchLimit: 1,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
    }

    // Should NOT call the Simple API when limit is 1
    const simpleApiCalls = mockAxiosGet.mock.calls.filter(
      call => call[0] === 'https://pypi.org/simple/'
    );
    expect(simpleApiCalls.length).toBe(0);
  });

  it('should return full metadata when pythonFetchMetadata is true with fuzzy search', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'flask' }, { name: 'flask-restful' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      const match = url.match(/\/pypi\/([^/]+)\/json/);
      if (match) {
        return Promise.resolve({
          data: {
            info: {
              name: match[1],
              version: '2.0.0',
              summary: `${match[1]} framework`,
              keywords: 'web framework',
              author: 'Test Author',
              license: 'MIT',
              home_page: 'https://example.com',
              project_urls: {
                Source: `https://github.com/test/${match[1]}`,
              },
            },
          },
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'flask',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // Fuzzy search should return up to searchLimit packages
      expect(result.packages.length).toBeGreaterThanOrEqual(1);
      expect(result.packages.length).toBeLessThanOrEqual(2);
      const pkg = result.packages[0]!;
      expect('version' in pkg).toBe(true);
      expect('description' in pkg).toBe(true);
      expect('author' in pkg).toBe(true);
    }
  });
});

// ============================================
// NEW TESTS: checkNpmDeprecation utility
// ============================================
describe('checkNpmDeprecation utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return deprecated info for deprecated packages', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout:
        '"request has been deprecated, see https://github.com/request/request/issues/3142"',
      stderr: '',
      exitCode: 0,
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('request');

    expect(result).not.toBeNull();
    expect(result?.deprecated).toBe(true);
    expect(result?.message).toContain('request has been deprecated');
  });

  it('should return not deprecated for active packages', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: 'undefined',
      stderr: '',
      exitCode: 0,
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('lodash');

    expect(result).not.toBeNull();
    expect(result?.deprecated).toBe(false);
  });

  it('should return null on command failure', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: 'Package not found',
      exitCode: 1,
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('nonexistent-pkg');

    expect(result).toBeNull();
  });

  it('should return deprecated with raw message when JSON parse fails', async () => {
    // Non-JSON output that's not "undefined"
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: 'This package has been deprecated without valid JSON',
      stderr: '',
      exitCode: 0,
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('old-pkg');

    expect(result).not.toBeNull();
    expect(result?.deprecated).toBe(true);
    expect(result?.message).toBe(
      'This package has been deprecated without valid JSON'
    );
  });

  it('should handle non-string JSON deprecation message', async () => {
    // JSON output that parses to non-string (e.g., object)
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '{"reason": "deprecated"}',
      stderr: '',
      exitCode: 0,
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('pkg-with-object-message');

    expect(result).not.toBeNull();
    expect(result?.deprecated).toBe(true);
    expect(result?.message).toBe('This package is deprecated');
  });

  it('should return not deprecated for empty string output', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('active-pkg');

    expect(result).not.toBeNull();
    expect(result?.deprecated).toBe(false);
  });

  it('should return null when command throws error', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: new Error('Command failed'),
    });

    const { checkNpmDeprecation } = await import('../../src/utils/package.js');
    const result = await checkNpmDeprecation('error-pkg');

    expect(result).toBeNull();
  });
});

// ============================================
// ADDITIONAL COVERAGE TESTS: fetchPyPIPackageDetails branches
// ============================================
describe('fetchPyPIPackageDetails coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPyPICache(); // Bug #2 fix: Reset cache to prevent test pollution
  });

  it('should use home_page as repository fallback for github URLs', async () => {
    // No project_urls but has home_page with github
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'test-pkg',
          version: '1.0.0',
          summary: 'Test package',
          keywords: '',
          home_page: 'https://github.com/test/test-pkg',
          project_urls: null,
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
        'https://github.com/test/test-pkg'
      );
    }
  });

  it('should use home_page as repository fallback for gitlab URLs', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'gitlab-pkg',
          version: '1.0.0',
          summary: 'GitLab package',
          keywords: '',
          home_page: 'https://gitlab.com/test/gitlab-pkg',
          project_urls: null,
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'gitlab-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages[0]!.repository).toBe(
        'https://gitlab.com/test/gitlab-pkg'
      );
    }
  });

  it('should use home_page as repository fallback for bitbucket URLs', async () => {
    const mockPyPIResponse = {
      data: {
        info: {
          name: 'bitbucket-pkg',
          version: '1.0.0',
          summary: 'Bitbucket package',
          keywords: '',
          home_page: 'https://bitbucket.org/test/bitbucket-pkg',
          project_urls: null,
        },
      },
    };

    mockAxiosGet.mockResolvedValue(mockPyPIResponse);

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'bitbucket-pkg',
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages[0]!.repository).toBe(
        'https://bitbucket.org/test/bitbucket-pkg'
      );
    }
  });

  it('should return full metadata with truncated description for fuzzy search', async () => {
    const longDescription = 'C'.repeat(300);
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'longdesc-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'longdesc-pkg',
            version: '1.0.0',
            summary: longDescription,
            keywords: 'test keyword',
            author: 'Test Author',
            license: 'MIT',
            home_page: 'https://example.com',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'longdesc',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { description: string };
      expect(pkg.description!.length).toBeLessThanOrEqual(203);
      expect(pkg.description!.endsWith('...')).toBe(true);
    }
  });

  it('should handle fetchPyPIPackageDetails returning null on error', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'error-pkg' }, { name: 'valid-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      // First package fetch fails, second succeeds
      if (url.includes('error-pkg')) {
        return Promise.reject(new Error('Package fetch failed'));
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'valid-pkg',
            version: '1.0.0',
            summary: 'Valid package',
            keywords: '',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'pkg',
      searchLimit: 2,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // Should filter out null results
      expect(result.packages.every(p => p !== null && p !== undefined)).toBe(
        true
      );
    }
  });

  it('should handle fuzzy search with no matches falling back to exact match', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'other-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      // Exact match for the original query
      return Promise.resolve({
        data: {
          info: {
            name: 'nonexistent-xyz',
            version: '1.0.0',
            summary: 'Found via exact match',
            keywords: '',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'nonexistent-xyz',
      searchLimit: 5,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    // Should fall back to exact match when fuzzy finds nothing
    expect('packages' in result).toBe(true);
  });

  it('should return full metadata including description from fuzzy search', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'metadata-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'metadata-pkg',
            version: '2.0.0',
            summary: 'Package with summary',
            description: 'Long description fallback',
            keywords: ['key1', 'key2'],
            author: 'Author Name',
            license: 'MIT',
            home_page: 'https://example.com',
            project_urls: {
              Source: 'https://github.com/test/metadata-pkg',
            },
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'metadata',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as {
        version: string;
        description: string;
        keywords: string[];
        author: string;
        license: string;
        homepage: string;
      };
      expect(pkg.version).toBe('2.0.0');
      expect(pkg.description).toBe('Package with summary');
      expect(pkg.keywords).toEqual(['key1', 'key2']);
      expect(pkg.author).toBe('Author Name');
      expect(pkg.license).toBe('MIT');
      expect(pkg.homepage).toBe('https://example.com');
    }
  });

  it('should use description as fallback when summary is empty', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'desc-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'desc-pkg',
            version: '1.0.0',
            summary: null,
            description: 'Fallback description text',
            keywords: '',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'desc',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { description: string };
      expect(pkg.description).toBe('Fallback description text');
    }
  });

  it('should handle fetchPyPIPackageList throwing error and fallback to exact match', async () => {
    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        // Simulate network error when fetching package list
        return Promise.reject(new Error('Network error'));
      }
      // Return valid response for exact match fallback
      return Promise.resolve({
        data: {
          info: {
            name: 'fallback-pkg',
            version: '1.0.0',
            summary: 'Found via fallback',
            keywords: '',
            project_urls: {
              Source: 'https://github.com/test/fallback-pkg',
            },
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'fallback-pkg',
      searchLimit: 3, // > 1 triggers fuzzy search
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should handle package info with null version in fuzzy search', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'null-ver-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'null-ver-pkg',
            version: null, // null version - should default to 'latest'
            summary: 'Summary text',
            keywords: '',
            author: null,
            license: null,
            home_page: null,
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'null-ver',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { name: string; version: string };
      expect(pkg.name).toBe('null-ver-pkg');
      expect(pkg.version).toBe('latest');
    }
  });

  it('should handle package with null summary and description', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'no-desc-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'no-desc-pkg',
            version: '1.0.0',
            summary: null,
            description: null,
            keywords: '',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'no-desc',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { description: string | null };
      expect(pkg.description).toBeNull();
    }
  });

  it('should truncate description over 200 chars in fuzzy search', async () => {
    const longSummary = 'D'.repeat(250);
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'long-sum-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'long-sum-pkg',
            version: '1.0.0',
            summary: longSummary,
            keywords: '',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'long-sum',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { description: string };
      expect(pkg.description!.length).toBe(203); // 200 + '...'
      expect(pkg.description!.endsWith('...')).toBe(true);
    }
  });

  it('should handle string keywords in fuzzy search', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'str-kw-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'str-kw-pkg',
            version: '1.0.0',
            summary: 'Summary',
            keywords: 'keyword1, keyword2, keyword3',
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'str-kw',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { keywords: string[] };
      expect(pkg.keywords.length).toBeGreaterThan(0);
      expect(pkg.keywords).toContain('keyword1');
    }
  });

  it('should limit keywords to 10 in fuzzy search', async () => {
    const mockSimpleResponse = {
      data: {
        projects: [{ name: 'many-kw-pkg' }],
      },
    };

    mockAxiosGet.mockImplementation((url: string) => {
      if (url === 'https://pypi.org/simple/') {
        return Promise.resolve(mockSimpleResponse);
      }
      return Promise.resolve({
        data: {
          info: {
            name: 'many-kw-pkg',
            version: '1.0.0',
            summary: 'Summary',
            keywords: [
              'a',
              'b',
              'c',
              'd',
              'e',
              'f',
              'g',
              'h',
              'i',
              'j',
              'k',
              'l',
            ],
            project_urls: {},
          },
        },
      });
    });

    const query: PackageSearchInput = {
      ecosystem: 'python',
      name: 'many-kw',
      searchLimit: 2,
      pythonFetchMetadata: true,
      mainResearchGoal: 'Test',
      researchGoal: 'Test',
      reasoning: 'Test',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result && result.packages.length > 0) {
      const pkg = result.packages[0] as { keywords: string[] };
      expect(pkg.keywords.length).toBeLessThanOrEqual(10);
    }
  });
});
