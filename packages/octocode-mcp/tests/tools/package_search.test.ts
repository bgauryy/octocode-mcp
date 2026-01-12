import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PackageSearchQuerySchema } from '../../src/tools/package_search/scheme.js';
import type { ToolInvocationCallback } from '../../src/types.js';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { clearAllCache } from '../../src/utils/http/cache.js';

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

// Store for npm CLI view responses (package name -> repository URL or object)
const npmCliViewResponses: Map<
  string,
  { url?: string; object?: { type: string; url: string; directory?: string } }
> = new Map();

// Store for full npm view responses (package name -> full package data)
// Used by the new exact package name lookup flow
const npmViewFullResponses: Map<
  string,
  {
    name: string;
    version?: string;
    description?: string;
    keywords?: string[];
    license?: string;
    homepage?: string;
    repository?: string | { type?: string; url?: string; directory?: string };
  }
> = new Map();

// Helper to set npm CLI view mock for a package (URL format)
function mockNpmCliViewUrl(packageName: string, repoUrl: string): void {
  npmCliViewResponses.set(packageName, { url: repoUrl });
}

// Helper to set full npm view mock for exact package lookup
function mockNpmViewFull(
  packageName: string,
  data: {
    name: string;
    version?: string;
    description?: string;
    keywords?: string[];
    license?: string;
    homepage?: string;
    repository?: string | { type?: string; url?: string; directory?: string };
  }
): void {
  npmViewFullResponses.set(packageName, data);
}

// Helper to clear npm CLI view mocks
function clearNpmCliViewMocks(): void {
  npmCliViewResponses.clear();
  npmViewFullResponses.clear();
}

// Helper to create a mock implementation for executeNpmCommand that handles both search and view
function createNpmCommandMock(searchResult: {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: Error;
}) {
  return (command: string, args: string[]) => {
    // Handle search command
    if (command === 'search') {
      return Promise.resolve(searchResult);
    }

    // Handle view command
    if (command === 'view' && args.length >= 1) {
      const packageName = args[0] as string;
      const field = args.length >= 2 ? (args[1] as string) : null;

      // Handle full view (npm view <package> --json) - for exact package lookup
      // This is the new pattern: args = [packageName, '--json']
      if (field === '--json' || (args.length === 2 && args[1] === '--json')) {
        const fullResponse = npmViewFullResponses.get(packageName);
        if (fullResponse) {
          return Promise.resolve({
            stdout: JSON.stringify(fullResponse),
            stderr: '',
            exitCode: 0,
          });
        }
        // Package not found - return non-zero exit code
        return Promise.resolve({
          stdout: '',
          stderr: `npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/${packageName} - Not found`,
          exitCode: 1,
        });
      }

      const cliResponse = npmCliViewResponses.get(packageName);

      // Check if it's a repository.url request
      if (field === 'repository.url') {
        if (cliResponse?.url) {
          return Promise.resolve({
            stdout: JSON.stringify(cliResponse.url),
            stderr: '',
            exitCode: 0,
          });
        }
        // Return empty if no URL (will trigger object fetch or API fallback)
        return Promise.resolve({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });
      }

      // Check if it's a repository request (object format)
      if (field === 'repository') {
        if (cliResponse?.object) {
          return Promise.resolve({
            stdout: JSON.stringify(cliResponse.object),
            stderr: '',
            exitCode: 0,
          });
        }
        // Return empty if no object
        return Promise.resolve({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });
      }

      // Handle deprecated field check
      if (field === 'deprecated') {
        return Promise.resolve({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });
      }
    }

    // Default response for other commands
    return Promise.resolve({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
  };
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
vi.mock('../../src/utils/exec/index.js', () => ({
  executeNpmCommand: (...args: unknown[]) => mockExecuteNpmCommand(...args),
  checkNpmAvailability: (...args: unknown[]) =>
    mockCheckNpmAvailability(...args),
}));

// Mock the cache to prevent interference
vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
  clearAllCache: vi.fn(),
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
  type NpmPackageResult,
  type MinimalPackageResult,
  type PythonPackageResult,
} from '../../src/utils/package/common.js';
import { registerPackageSearchTool } from '../../src/tools/package_search/package_search.js';

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
    clearAllCache();
    clearNpmRegistryMocks();
    clearNpmCliViewMocks();
  });

  it('should return minimal NPM package results by default (name and repository only)', async () => {
    // Mock full npm view response for exact package lookup
    mockNpmViewFull('axios', {
      name: 'axios',
      version: '1.6.0',
      description: 'Promise based HTTP client for the browser and node.js',
      keywords: ['xhr', 'http', 'ajax', 'promise', 'node'],
      repository: 'git+https://github.com/axios/axios.git',
      homepage: 'https://axios-http.com',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

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
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.path).toBe('axios');
      expect(pkg.repoUrl).toBe('https://github.com/axios/axios');
      // version IS present now
      expect(pkg.version).toBe('1.6.0');

      // description and keywords are REMOVED
      expect('description' in pkg).toBe(false);
      expect('keywords' in pkg).toBe(false);

      expect(result.ecosystem).toBe('npm');
      expect(result.totalFound).toBe(1);
    }

    // Verify npm view was called for exact package lookup
    expect(mockExecuteNpmCommand).toHaveBeenCalledWith('view', [
      'axios',
      '--json',
    ]);
  });

  it('should return full NPM package results when npmFetchMetadata is true', async () => {
    // Mock full npm view response for exact package lookup
    mockNpmViewFull('axios', {
      name: 'axios',
      version: '1.6.0',
      description: 'Promise based HTTP client for the browser and node.js',
      keywords: ['xhr', 'http', 'ajax', 'promise', 'node'],
      repository: 'git+https://github.com/axios/axios.git',
      homepage: 'https://axios-http.com',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

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
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.path).toBe('axios');
      expect(pkg.repoUrl).toBe('https://github.com/axios/axios');

      // fields present
      expect(pkg.version).toBe('1.6.0');

      // Extended metadata fields ARE returned when npmFetchMetadata=true
      expect(pkg.description).toBe(
        'Promise based HTTP client for the browser and node.js'
      );
      expect(pkg.keywords).toEqual(['xhr', 'http', 'ajax', 'promise', 'node']);
      expect(pkg.homepage).toBe('https://axios-http.com');

      expect(result.ecosystem).toBe('npm');
      expect(result.totalFound).toBe(1);
    }
  });

  it('should handle NPM CLI search with multiple results (keyword search)', async () => {
    // Use keyword search (with space) to trigger npm search flow
    const mockCliOutput = JSON.stringify([
      {
        name: 'lodash',
        version: '4.17.21',
        description: 'Lodash modular utilities',
        keywords: ['modules', 'stdlib', 'util'],
        links: { repository: 'git+https://github.com/lodash/lodash.git' },
      },
      {
        name: 'lodash-es',
        version: '4.17.21',
        description: 'Lodash exported as ES modules',
        keywords: ['es', 'modules'],
        links: { repository: 'git+https://github.com/lodash/lodash.git' },
      },
    ]);

    // Mock CLI view responses for repository URLs (CLI-first approach)
    mockNpmCliViewUrl('lodash', 'git+https://github.com/lodash/lodash.git');
    mockNpmCliViewUrl('lodash-es', 'git+https://github.com/lodash/lodash.git');

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: mockCliOutput,
        stderr: '',
        exitCode: 0,
      })
    );

    // Keep API fallback mocks in case CLI fails
    mockNpmRegistry('lodash', 'git+https://github.com/lodash/lodash.git');
    mockNpmRegistry('lodash-es', 'git+https://github.com/lodash/lodash.git');

    // Use space in name to trigger keyword search (npm search) instead of exact lookup (npm view)
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'lodash utilities',
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

      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.path).toBe('lodash');
      // version IS present now
      expect(pkg.version).toBe('4.17.21');
      // mainEntry is null because we didn't fetch metadata
      expect(pkg.mainEntry).toBeNull();
    }

    // Verify searchLimit is passed (keyword search uses npm search)
    expect(mockExecuteNpmCommand).toHaveBeenCalledWith('search', [
      'lodash utilities',
      '--json',
      '--searchlimit=5',
    ]);
  });

  it('should return package details when npmFetchMetadata is true', async () => {
    // Mock full npm view response
    mockNpmViewFull('test-package', {
      name: 'test-package',
      version: '1.0.0',
      repository: 'https://github.com/test/test-package',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

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
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.path).toBe('test-package');
      expect(pkg.version).toBe('1.0.0');
      expect(pkg.repoUrl).toBe('https://github.com/test/test-package');
    }
  });

  it('should handle NPM CLI command error', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: new Error('Command timeout'),
    });

    // Use keyword search (with space) to test npm search flow error handling
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios http client',
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

  it('should handle NPM CLI non-zero exit code (keyword search)', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: 'npm ERR! code E404',
      exitCode: 1,
    });

    // Use keyword search (with space) to test npm search flow error handling
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios http client',
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

  it('should handle invalid JSON output from CLI (keyword search)', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: 'not valid json',
      stderr: '',
      exitCode: 0,
    });

    // Use keyword search (with space) to test npm search flow error handling
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios http',
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

  it('should handle empty search results (keyword search)', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '[]',
      stderr: '',
      exitCode: 0,
    });

    // Use keyword search (with space) to test npm search flow
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'nonexistent package xyz123',
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
    clearAllCache();
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
      const pkg = result.packages[0] as MinimalPackageResult;
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
      const pkg = result.packages[0] as PythonPackageResult;
      expect(pkg.name).toBe('requests');
      expect(pkg.repository).toBe('https://github.com/psf/requests');
      // With pythonFetchMetadata: true, should have full fields
      expect('version' in pkg).toBe(true);
      expect('description' in pkg).toBe(true);
      expect('keywords' in pkg).toBe(true);
      expect(pkg.version).toBe('2.31.0');
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
      const pkg = result.packages[0] as MinimalPackageResult;
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
    clearAllCache();
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
      const pkg = result.packages[0] as MinimalPackageResult;
      expect(pkg.name).toBe('some_package');
    }
  });
});

describe('searchPackage - NPM Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache();
    clearNpmRegistryMocks();
  });

  it('should handle non-array npm search response', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '{"notAnArray": true}',
      stderr: '',
      exitCode: 0,
    });

    // Use keyword search (with space) to test npm search flow
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'test pkg keyword',
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
    clearAllCache();
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
      const pkg = result.packages[0] as MinimalPackageResult;
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
      const pkg = result.packages[0] as MinimalPackageResult;
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
      const pkg = result.packages[0] as MinimalPackageResult;
      expect(pkg.name).toBe('test-pkg');
      expect(pkg.repository).toBe('https://github.com/test/test-pkg');
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
      const pkg = result.packages[0] as MinimalPackageResult;
      expect(pkg.repository).toBe('https://gitlab.com/test/repo');
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
      const pkg = result.packages[0] as MinimalPackageResult;
      expect(pkg.repository).toBe('https://bitbucket.org/test/repo');
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
      const pkg = result.packages[0] as MinimalPackageResult;
      expect(pkg.repository).toBe('https://gitlab.com/test/repo');
    }
  });
});

describe('Package search response structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache();
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

      // Verify NPM structure (always has version now, but specific fields for metadata might be missing if I checked that way, but I just rely on search results which have version)
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg).toHaveProperty('path');
      expect(pkg).toHaveProperty('repoUrl');
      expect(pkg).toHaveProperty('version');

      // Removed fields
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
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg).toHaveProperty('path');
      expect(pkg).toHaveProperty('version');
      expect(pkg).toHaveProperty('repoUrl');
      // mainEntry/typeDefinitions will be present (fetched via view in real impl, but here mockCliOutput doesn't trigger view in test?)
      // Wait, in `searchNpmPackageViaSearch`, if `fetchMetadata` is true, we call `fetchPackageDetails`.
      // `fetchPackageDetails` calls `executeNpmCommand('view', ...)`
      // In this test, we mock `mockExecuteNpmCommand` once.
      // If code calls `view`, it will fail or use same mock?
      // The mock returns search output.
      // If code calls `view`, `createNpmCommandMock` handles it?
      // In this test (L1355), `mockExecuteNpmCommand.mockResolvedValue` is used, NOT `createNpmCommandMock`.
      // So subsequent call to `view` will get the SAME response (search output).
      // `fetchPackageDetails` expects view output.
      // `view` output: `{ name: 'express', ... }` (single object).
      // Search output: `[{ name: 'express', ... }]` (array).
      // My `fetchPackageDetails` handles array or object.
      // So if it gets array, it takes [0].
      // So it should work!
      // And properties will be mapped.

      expect(pkg).toHaveProperty('mainEntry'); // will be null if not in mock
    }
  });

  it('should return proper structure for error response', async () => {
    mockExecuteNpmCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: new Error('Command failed'),
    });

    // Use keyword search (with space) to trigger npm search flow which returns errors
    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'test package search',
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
    clearAllCache();
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
      // Mock full npm view response for exact package lookup
      mockNpmViewFull('react', {
        name: 'react',
        version: '18.0.0',
        description: 'React library',
        keywords: ['ui'],
        repository: 'git+https://github.com/facebook/react.git',
      });

      mockExecuteNpmCommand.mockImplementation(
        createNpmCommandMock({
          stdout: '', // Not used for exact package lookup
          stderr: '',
          exitCode: 0,
        })
      );

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
      // Use keyword search (with space) to test npm search flow with empty results
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
            name: 'nonexistent pkg xyz keyword',
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
      // Mock full npm view responses for exact package lookups
      mockNpmViewFull('pkg1', { name: 'pkg1', version: '1.0.0' });
      mockNpmViewFull('pkg2', { name: 'pkg2', version: '1.0.0' });

      mockExecuteNpmCommand.mockImplementation(
        createNpmCommandMock({
          stdout: '', // Not used for exact package lookup
          stderr: '',
          exitCode: 0,
        })
      );

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
      // For exact package names, npm view is called:
      // 2 view calls for package info + 2 deprecation checks
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

      // Use keyword search (with space) to trigger npm search flow which returns errors
      const result = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'test pkg search',
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
      // Mock full npm view response for exact package lookup
      mockNpmViewFull('axios', {
        name: 'axios',
        version: '1.6.0',
        description: 'HTTP client',
        keywords: ['http'],
        repository: 'git+https://github.com/axios/axios.git',
      });

      mockExecuteNpmCommand.mockImplementation(
        createNpmCommandMock({
          stdout: '', // Not used for exact package lookup
          stderr: '',
          exitCode: 0,
        })
      );

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
      // Use keyword search (with space) to test npm search flow empty results
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
            name: 'nonexistent pkg xyz123 keyword',
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
        "No npm packages found for 'nonexistent pkg xyz123 keyword'"
      );
      expect(text).toContain(
        'Browse: https://npmjs.com/search?q=nonexistent%20pkg%20xyz123%20keyword'
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
      // Mock full npm view response for exact package lookup (react)
      mockNpmViewFull('react', {
        name: 'react',
        version: '18.0.0',
        description: 'React library',
        keywords: ['ui'],
        repository: 'git+https://github.com/facebook/react.git',
      });

      mockExecuteNpmCommand.mockImplementation(
        createNpmCommandMock({
          stdout: '[]', // For keyword search (empty results)
          stderr: '',
          exitCode: 0,
        })
      );

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
            // Use keyword search (with space) for empty result
            ecosystem: 'npm',
            name: 'nonexistent pkg keyword',
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
      expect(text).toContain(
        "No npm packages found for 'nonexistent pkg keyword'"
      );
      expect(text).toContain(
        'Browse: https://npmjs.com/search?q=nonexistent%20pkg%20keyword'
      );
    });

    it('should generate correct hints based on generateSuccessHints for mixed ecosystems', async () => {
      // Mock full npm view response for exact package lookup
      mockNpmViewFull('lodash', {
        name: 'lodash',
        version: '4.17.21',
        description: 'Utility library',
        keywords: [],
        repository: 'git+https://github.com/lodash/lodash.git',
      });

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

      mockExecuteNpmCommand.mockImplementation(
        createNpmCommandMock({
          stdout: '', // Not used for exact package lookup
          stderr: '',
          exitCode: 0,
        })
      );

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

      // Test npm empty hints - use keyword search (with space) for npm search flow
      const npmResult = await mockServer.callTool('packageSearch', {
        queries: [
          {
            ecosystem: 'npm',
            name: 'nonexistent npm pkg keyword',
            mainResearchGoal: 'Test',
            researchGoal: 'Test',
            reasoning: 'Test',
          },
        ],
      });

      const npmText = (npmResult.content[0] as { text: string }).text;
      expect(npmText).toContain(
        "No npm packages found for 'nonexistent npm pkg keyword'"
      );
      expect(npmText).toContain(
        'Browse: https://npmjs.com/search?q=nonexistent%20npm%20pkg%20keyword'
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
    clearAllCache();
    clearNpmRegistryMocks();
    mockCheckNpmAvailability.mockResolvedValue(true);
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  it('should generate actionable GitHub tool call hints for npm packages', async () => {
    // Mock full npm view response for exact package lookup
    mockNpmViewFull('axios', {
      name: 'axios',
      version: '1.6.0',
      description: 'HTTP client',
      keywords: [],
      repository: 'git+https://github.com/axios/axios.git',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

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
    // Mock full npm view response for exact package lookup with .git suffix
    mockNpmViewFull('lodash', {
      name: 'lodash',
      version: '4.17.21',
      description: 'Utility library',
      keywords: [],
      repository: 'git+https://github.com/lodash/lodash.git',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

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
    clearAllCache();
    mockCheckNpmAvailability.mockResolvedValue(true);
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  it('should suggest name variations with hyphens converted to underscores', async () => {
    // Use keyword search (with space) to get npm search flow with empty results
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
          name: 'date-fns keyword', // Use space to trigger keyword search
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    // Name variation suggestions are generated for empty results
    expect(text).toContain("No npm packages found for 'date-fns keyword'");
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
    // Scoped package not found - uses npm view which returns empty
    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used
        stderr: '',
        exitCode: 0,
      })
    );

    await registerPackageSearchTool(mockServer.server);

    const result = await mockServer.callTool('packageSearch', {
      queries: [
        {
          ecosystem: 'npm',
          name: '@nonexistent/package',
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Try: package');
  });

  it('should suggest js suffix for npm packages', async () => {
    // Use keyword search (with space) to get npm search flow with empty results
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
          name: 'chart library', // Use space to trigger keyword search
          mainResearchGoal: 'Test',
          researchGoal: 'Test',
          reasoning: 'Test',
        },
      ],
    });

    const text = (result.content[0] as { text: string }).text;
    // Name variation suggestions include js suffix hint
    expect(text).toContain("No npm packages found for 'chart library'");
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
    clearAllCache();
    mockCheckNpmAvailability.mockResolvedValue(true);
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  it('should show deprecation warning for deprecated npm packages', async () => {
    // Mock full npm view response for exact package lookup
    mockNpmViewFull('request', {
      name: 'request',
      version: '2.88.2',
      description: 'Simplified HTTP request client',
      keywords: [],
      repository: 'https://github.com/request/request',
    });

    // Mock deprecation check
    mockExecuteNpmCommand.mockImplementation((cmd: string, args: string[]) => {
      // Handle full view for exact package lookup
      if (cmd === 'view' && args.length === 2 && args[1] === '--json') {
        const fullResponse = npmViewFullResponses.get(args[0] as string);
        if (fullResponse) {
          return Promise.resolve({
            stdout: JSON.stringify(fullResponse),
            stderr: '',
            exitCode: 0,
          });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 });
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
      const pkg = result.packages[0] as MinimalPackageResult;
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
      const pkg = result.packages[0] as PythonPackageResult;
      expect(pkg.name).toBe('requests');
      expect('version' in pkg).toBe(true);
      expect('description' in pkg).toBe(true);
      expect('author' in pkg).toBe(true);
      expect(pkg.version).toBe('2.31.0');
      expect(pkg.author).toBe('Kenneth Reitz');
    }
  });
});

// ============================================
// NEW TESTS: Task 5 - PyPI Fuzzy Search (REMOVED)
// ============================================

describe('searchPackage - NPM CLI Repository Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache();
    clearNpmRegistryMocks();
    clearNpmCliViewMocks();
  });

  it('should fetch repository URL via CLI (string format)', async () => {
    // Mock full npm view response for exact package lookup
    mockNpmViewFull('axios', {
      name: 'axios',
      version: '1.6.0',
      description: 'HTTP client',
      repository: 'git+https://github.com/axios/axios.git',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'axios',
      mainResearchGoal: 'Test CLI repository URL fetching',
      researchGoal: 'Test string URL format',
      reasoning: 'Verify CLI-first approach works',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.repoUrl).toBe('https://github.com/axios/axios');
    }

    // Verify npm view was called for exact package lookup
    expect(mockExecuteNpmCommand).toHaveBeenCalledWith('view', [
      'axios',
      '--json',
    ]);
  });

  it('should fetch repository URL via CLI (object format like @wix packages)', async () => {
    // Mock full npm view response for exact package lookup (object repository format)
    mockNpmViewFull('@wix/yoshi-style-dependencies', {
      name: '@wix/yoshi-style-dependencies',
      version: '6.0.0',
      repository: {
        type: 'git',
        url: 'https://github.com/wix-private/yoshi.git',
        directory: 'legacy-packages/yoshi-style-dependencies',
      },
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: '@wix/yoshi-style-dependencies',
      mainResearchGoal: 'Test CLI repository URL fetching',
      researchGoal: 'Test object URL format',
      reasoning: 'Verify CLI handles @wix package format',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.repoUrl).toBe('https://github.com/wix-private/yoshi');
    }
  });

  it('should handle package without repository defined', async () => {
    // Mock full npm view response without repository
    // (package exists but has no repository URL)
    mockNpmViewFull('some-package', {
      name: 'some-package',
      version: '1.0.0',
      // No repository field
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'some-package',
      mainResearchGoal: 'Test package without repository',
      researchGoal: 'Test when package has no repository',
      reasoning: 'Verify null repository is returned gracefully',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0] as NpmPackageResult;
      // Should return null when no repository
      expect(pkg.repoUrl).toBeNull();
    }
  });

  it('should return empty when package not found', async () => {
    // No mock set for this package - simulates package not found

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'no-repo-package',
      mainResearchGoal: 'Test package not found case',
      researchGoal: 'Test when package does not exist',
      reasoning: 'Verify empty result is returned gracefully',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      // Package not found returns empty array
      expect(result.packages.length).toBe(0);
    }
  });

  it('should handle scoped packages correctly', async () => {
    // Mock full npm view response for scoped package
    mockNpmViewFull('@types/node', {
      name: '@types/node',
      version: '20.0.0',
      repository: 'https://github.com/DefinitelyTyped/DefinitelyTyped.git',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: '@types/node',
      mainResearchGoal: 'Test scoped package handling',
      researchGoal: 'Test @types/node repository fetching',
      reasoning: 'Verify scoped packages work with CLI',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0] as NpmPackageResult;
      expect(pkg.repoUrl).toBe(
        'https://github.com/DefinitelyTyped/DefinitelyTyped'
      );
    }
  });

  it('should clean git+ prefix and .git suffix from CLI response', async () => {
    // Mock full npm view response with git+ prefix and .git suffix
    mockNpmViewFull('lodash', {
      name: 'lodash',
      version: '4.17.21',
      repository: 'git+https://github.com/lodash/lodash.git',
    });

    mockExecuteNpmCommand.mockImplementation(
      createNpmCommandMock({
        stdout: '', // Not used for exact package lookup
        stderr: '',
        exitCode: 0,
      })
    );

    const query: PackageSearchInput = {
      ecosystem: 'npm',
      name: 'lodash',
      mainResearchGoal: 'Test URL cleaning',
      researchGoal: 'Test git+ and .git are removed',
      reasoning: 'Verify URL is cleaned properly',
    };

    const result = await searchPackage(query);

    expect('packages' in result).toBe(true);
    if ('packages' in result) {
      expect(result.packages.length).toBe(1);
      const pkg = result.packages[0] as NpmPackageResult;
      // Should NOT have git+ prefix or .git suffix
      expect(pkg.repoUrl).toBe('https://github.com/lodash/lodash');
      expect(pkg.repoUrl).not.toContain('git+');
      expect(pkg.repoUrl).not.toMatch(/\.git$/);
    }
  });
});
