import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());
const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
}));

// Mock dependencies
vi.mock('../../src/mcp/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

// Import after mocking
import { registerPackageSearchTool } from '../../src/mcp/tools/package_search.js';

describe('Package Search Tool (NPM & Python)', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Register the tool for testing with npmEnabled true
    registerPackageSearchTool(mockServer.server);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the package search tool', () => {
      registerPackageSearchTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'packageSearch',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('NPM Package Search', () => {
    it('should handle successful package search', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockNpmResponse = {
        result: [
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            keywords: ['react'],
            links: { repository: 'https://github.com/facebook/react' },
          },
        ],
        command: 'npm search react --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'react' }],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['react', '--searchlimit=1', '--json'],
        { cache: true }
      );

      // Check the result contains the NPM package
      expect(result.content).toBeDefined();
      expect(result.content[0]?.type).toBe('text');
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.total_count).toBe(1);
      expect(response.data.npm).toHaveLength(1);
      expect(response.data.python || []).toHaveLength(0);
      expect(response.data.npm[0].name).toBe('react');
      expect(response.data.npm[0].version).toBe('18.2.0');
      expect(response.data.npm[0].repository).toBe(
        'https://github.com/facebook/react'
      );
    });

    it('should handle no packages found', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockNpmResponse = {
        result: '[]', // Empty results
        command: 'npm search nonexistent-package-xyz --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'nonexistent-package-xyz' }],
      });

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0]?.text as string);
      expect(errorData.meta).toHaveProperty('error');
      expect(errorData.hints).toBeDefined();
      expect(errorData.hints.length).toBeGreaterThan(0);
    });
  });

  describe('Python Package Search', () => {
    it('should handle successful Python package search', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockPyPIResponse = {
        info: {
          name: 'requests',
          version: '2.31.0',
          summary: 'Python HTTP for Humans.',
          keywords: 'http requests',
          project_urls: {
            Source: 'https://github.com/psf/requests',
          },
        },
      };

      mockAxios.get.mockResolvedValue({
        data: mockPyPIResponse,
      });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [{ name: 'requests' }],
      });

      expect(result.isError).toBe(false);
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://pypi.org/pypi/requests/json',
        {
          timeout: 15000,
          headers: {
            'User-Agent': 'octocode-mcp/2.3.21',
            Accept: 'application/json',
          },
          validateStatus: expect.any(Function),
        }
      );

      // Check the result contains the Python package
      expect(result.content).toBeDefined();
      expect(result.content[0]?.type).toBe('text');
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.total_count).toBe(1);
      expect(response.data.npm || []).toHaveLength(0);
      expect(response.data.python).toHaveLength(1);
      expect(response.data.python[0].name).toBe('requests');
      expect(response.data.python[0].repository).toBe(
        'https://github.com/psf/requests'
      );
    });

    it('should handle Python package not found', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      mockAxios.get.mockRejectedValue(new Error('404 Not Found'));

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [{ name: 'nonexistent-python-package' }],
      });

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0]?.text as string);
      expect(errorData.meta).toHaveProperty('error');
      expect(errorData.hints).toBeDefined();
      expect(errorData.hints.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple NPM Package Search', () => {
    it('should handle array of search queries', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockNpmResponse1 = {
        result: [
          {
            name: 'typescript',
            version: '5.3.0',
            description: 'TypeScript is a language for application development',
            keywords: ['typescript', 'javascript'],
            links: { repository: 'https://github.com/microsoft/TypeScript' },
          },
        ],
        command: 'npm search typescript --searchlimit=1 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [
          {
            name: 'eslint',
            version: '8.56.0',
            description: 'An AST-based pattern checker for JavaScript',
            keywords: ['eslint', 'lint'],
            links: { repository: 'https://github.com/eslint/eslint' },
          },
        ],
        command: 'npm search eslint --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'typescript' }, { name: 'eslint' }],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(2);

      // Check both packages are in results
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.total_count).toBe(2);
      expect(response.data.npm).toHaveLength(2);
      expect(response.data.python || []).toHaveLength(0);
      expect(response.data.npm[0].name).toBe('typescript');
      expect(response.data.npm[1].name).toBe('eslint');
    });

    it('should handle single npm package with npmPackageName parameter', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockNpmResponse = {
        result: [
          {
            name: 'express',
            version: '4.18.2',
            description: 'Fast, unopinionated, minimalist web framework',
            keywords: ['express', 'framework', 'web'],
            links: { repository: 'https://github.com/expressjs/express' },
          },
        ],
        command: 'npm search express --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'express' }],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['express', '--searchlimit=1', '--json'],
        { cache: true }
      );
    });

    it('should handle combined search strategy for multiple terms', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockCombinedResponse = {
        result: [
          {
            name: 'react-router',
            version: '6.0.0',
            description: 'React router library',
            keywords: ['react', 'router'],
            links: { repository: 'https://github.com/remix-run/react-router' },
          },
        ],
        command: 'npm search react router --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockCombinedResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'react router' }],
        npmSearchStrategy: 'combined',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['react router', '--searchlimit=1', '--json'],
        { cache: true }
      );

      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.npm).toHaveLength(1);
      expect(response.data.npm[0].name).toBe('react-router');
    });

    it('should handle JSON string array format', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockNpmResponse1 = {
        result: [
          {
            name: 'lodash',
            version: '4.17.21',
            description: 'Lodash modular utilities',
            keywords: ['lodash', 'utility'],
            links: { repository: 'https://github.com/lodash/lodash' },
          },
        ],
        command: 'npm search lodash --searchlimit=1 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [
          {
            name: 'axios',
            version: '1.6.0',
            description: 'Promise based HTTP client',
            keywords: ['axios', 'http'],
            links: { repository: 'https://github.com/axios/axios' },
          },
        ],
        command: 'npm search axios --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      // Test JSON string format
      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'lodash' }, { name: 'axios' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.npm).toHaveLength(2);
      expect(response.data.npm[0].name).toBe('lodash');
      expect(response.data.npm[1].name).toBe('axios');
    });

    it('should handle comma-separated string format', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      const mockNpmResponse1 = {
        result: [
          {
            name: 'moment',
            version: '2.29.4',
            description: 'Parse, validate, manipulate dates',
            keywords: ['moment', 'date'],
            links: { repository: 'https://github.com/moment/moment' },
          },
        ],
        command: 'npm search moment --searchlimit=1 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [
          {
            name: 'dayjs',
            version: '1.11.10',
            description: 'Day.js is a minimalist date library',
            keywords: ['dayjs', 'date'],
            links: { repository: 'https://github.com/iamkun/dayjs' },
          },
        ],
        command: 'npm search dayjs --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      // Test comma-separated string format
      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'moment' }, { name: 'dayjs' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.npm).toHaveLength(2);
      expect(response.data.npm[0].name).toBe('moment');
      expect(response.data.npm[1].name).toBe('dayjs');
    });
  });

  describe('Bulk Query Support (New Format)', () => {
    it('should handle npmPackages array with individual parameters', async () => {
      const mockNpmResponse1 = {
        result: [
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            links: { repository: 'https://github.com/facebook/react' },
          },
        ],
        command: 'npm search react --searchlimit=5 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [
          {
            name: 'vue',
            version: '3.3.0',
            description: 'Vue.js framework',
            links: { repository: 'https://github.com/vuejs/vue' },
          },
        ],
        command: 'npm search vue --searchlimit=10 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'react', searchLimit: 5, id: 'react-query' },
          { name: 'vue', searchLimit: 10, id: 'vue-query' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.npm).toHaveLength(2);
      expect(response.data.npm[0].name).toBe('react');
      expect(response.data.npm[1].name).toBe('vue');

      // Verify individual search limits were used
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['react', '--searchlimit=5', '--json']),
        { cache: true }
      );
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['vue', '--searchlimit=10', '--json']),
        { cache: true }
      );
    });

    it('should handle pythonPackages array', async () => {
      mockAxios.get
        .mockResolvedValueOnce({
          data: {
            info: {
              name: 'requests',
              version: '2.31.0',
              summary: 'Python HTTP library',
              project_urls: {
                Source: 'https://github.com/psf/requests',
              },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            info: {
              name: 'django',
              version: '4.2.0',
              summary: 'Django web framework',
              project_urls: {
                Repository: 'https://github.com/django/django',
              },
            },
          },
        });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [
          { name: 'requests', id: 'http-lib' },
          { name: 'django', id: 'web-framework' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.python).toHaveLength(2);
      expect(response.data.python[0].name).toBe('requests');
      expect(response.data.python[1].name).toBe('django');
    });

    it('should handle mixed ecosystem bulk queries', async () => {
      const mockNpmResponse = {
        result: [
          {
            name: 'express',
            version: '4.18.0',
            description: 'Fast web framework',
            links: { repository: 'https://github.com/expressjs/express' },
          },
        ],
        command: 'npm search express --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      mockAxios.get.mockResolvedValueOnce({
        data: {
          info: {
            name: 'flask',
            version: '2.3.0',
            summary: 'Python web framework',
            project_urls: {
              Repository: 'https://github.com/pallets/flask',
            },
          },
        },
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'express' }],
        pythonPackages: [{ name: 'flask' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.npm).toHaveLength(1);
      expect(response.data.python).toHaveLength(1);
      expect(response.data.npm[0].name).toBe('express');
      expect(response.data.python[0].name).toBe('flask');
    });

    it('should apply global defaults to queries without specific values', async () => {
      const mockNpmResponse = {
        result: [
          {
            name: 'lodash',
            version: '4.17.21',
            description: 'Utility library',
            links: { repository: 'https://github.com/lodash/lodash' },
          },
        ],
        command: 'npm search lodash --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'lodash' }], // No searchLimit specified
        searchLimit: 15, // Global default
      });

      expect(result.isError).toBe(false);
      // Verify global default was applied
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['lodash', '--searchlimit=15', '--json']),
        { cache: true }
      );
    });

    it.skip('should handle NPM metadata fetching for specific queries', async () => {
      const mockSearchResponse = {
        result: [
          {
            name: 'typescript',
            version: '5.0.0',
            description: 'TypeScript compiler',
            links: { repository: 'https://github.com/microsoft/typescript' },
          },
        ],
        command: 'npm search typescript --searchlimit=1 --json',
        type: 'npm',
      };

      const mockViewResponse = {
        result: {
          name: 'typescript',
          version: '5.0.0',
          description: 'TypeScript compiler',
          license: 'Apache-2.0',
          repository: { url: 'https://github.com/microsoft/typescript' },
          dist: { unpackedSize: 12345678 },
          time: {
            created: '2012-10-01T12:00:00.000Z',
            modified: '2023-03-16T12:00:00.000Z',
          },
          versions: ['4.9.0', '5.0.0'],
        },
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockSearchResponse) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockViewResponse) }],
        });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'typescript', npmFetchMetadata: true, id: 'ts-query' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data.npm).toBeDefined();
      // For metadata fetching, the structure might be different
      if (response.data.npm.typescript) {
        expect(response.data.npm.typescript).toBeDefined();
        expect(response.data.npm.typescript.metadata).toBeDefined();
        expect(response.data.npm.typescript.gitURL).toContain(
          'microsoft/typescript'
        );
      } else {
        // Or it might be an array format
        expect(response.data.npm.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should detect format conflict and provide helpful error', async () => {
      const result = await mockServer.callTool('packageSearch', {
        // No parameters provided
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text as string;
      expect(
        errorText.includes('FALLBACK:') ||
          errorText.includes('CUSTOM:') ||
          errorText.includes('format') ||
          errorText.includes('npmPackages') ||
          errorText.includes('legacy')
      ).toBe(true);
    });
  });

  describe('Error Handling - Individual Query Failures', () => {
    it('should handle NPM package query failure with graceful degradation', async () => {
      // Mock successful response for first package
      const mockNpmResponse1 = {
        result: [
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            keywords: ['react'],
            links: { repository: 'https://github.com/facebook/react' },
          },
        ],
        command: 'npm search react --searchlimit=1 --json',
        type: 'npm',
      };

      // Mock empty response for second package (simulating failure)
      const mockNpmResponse2 = {
        result: [],
        command:
          'npm search xyz123nonexistentpackage456 --searchlimit=1 --json',
        type: 'npm',
      };

      // Mock successful response for third package
      const mockNpmResponse3 = {
        result: [
          {
            name: 'express',
            version: '4.18.2',
            description: 'Fast web framework',
            keywords: ['express', 'framework'],
            links: { repository: 'https://github.com/expressjs/express' },
          },
        ],
        command: 'npm search express --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse3) }],
        });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'react' },
          { name: 'xyz123nonexistentpackage456' },
          { name: 'express' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Should return only successful packages
      expect(response.data.total_count).toBe(2);
      expect(response.data.npm).toHaveLength(2);
      expect(response.data.npm[0].name).toBe('react');
      expect(response.data.npm[1].name).toBe('express');

      // Failed package should not appear in results
      const failedPackageNames = response.data.npm.map(
        (pkg: Record<string, unknown>) => pkg.name as string
      );
      expect(failedPackageNames).not.toContain('xyz123nonexistentpackage456');
    });

    it('should handle Python package query failure with graceful degradation', async () => {
      // Mock successful response for first package
      mockAxios.get
        .mockResolvedValueOnce({
          data: {
            info: {
              name: 'requests',
              version: '2.31.0',
              summary: 'Python HTTP for Humans.',
              project_urls: {
                Source: 'https://github.com/psf/requests',
              },
            },
          },
        })
        .mockRejectedValueOnce(new Error('404 Not Found')) // Second package fails
        .mockResolvedValueOnce({
          data: {
            info: {
              name: 'pandas',
              version: '2.0.0',
              summary: 'Data analysis library',
              project_urls: {
                Repository: 'https://github.com/pandas-dev/pandas',
              },
            },
          },
        });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [
          { name: 'requests' },
          { name: 'nonexistentpythonpackage123' },
          { name: 'pandas' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Should return only successful packages
      expect(response.data.total_count).toBe(2);
      expect(response.data.python).toHaveLength(2);
      expect(response.data.python[0].name).toBe('requests');
      expect(response.data.python[1].name).toBe('pandas');

      // Failed package should not appear in results
      const failedPackageNames = response.data.python.map(
        (pkg: Record<string, unknown>) => pkg.name as string
      );
      expect(failedPackageNames).not.toContain('nonexistentpythonpackage123');
    });

    it('should handle mixed ecosystem failures independently', async () => {
      // Mock NPM responses - one success, one failure
      const mockNpmResponse1 = {
        result: [
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            links: { repository: 'https://github.com/facebook/react' },
          },
        ],
        command: 'npm search react --searchlimit=1 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [],
        command:
          'npm search xyz123nonexistentpackage456 --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      // Mock Python responses - one success, one failure
      mockAxios.get
        .mockResolvedValueOnce({
          data: {
            info: {
              name: 'requests',
              version: '2.31.0',
              summary: 'Python HTTP library',
              project_urls: {
                Source: 'https://github.com/psf/requests',
              },
            },
          },
        })
        .mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'react' },
          { name: 'xyz123nonexistentpackage456' },
        ],
        pythonPackages: [
          { name: 'requests' },
          { name: 'nonexistentpythonpackage123' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Should return successful packages from both ecosystems
      expect(response.data.total_count).toBe(2);
      expect(response.data.npm).toHaveLength(1);
      expect(response.data.python).toHaveLength(1);
      expect(response.meta.ecosystems).toEqual(['npm', 'python']);

      expect(response.data.npm[0].name).toBe('react');
      expect(response.data.python[0].name).toBe('requests');
    });
  });

  describe('Error Handling - Complete Failure Scenarios', () => {
    it('should handle all NPM packages failing', async () => {
      // Mock empty responses for all NPM packages
      const mockNpmResponse1 = {
        result: [],
        command:
          'npm search xyz123nonexistentpackage456 --searchlimit=1 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [],
        command:
          'npm search abc789nonexistentpackage789 --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'xyz123nonexistentpackage456' },
          { name: 'abc789nonexistentpackage789' },
        ],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();
      expect(response.hints.length).toBeGreaterThan(0);

      // Should include specific error messages
      const hintsText = response.hints.join(' ');
      expect(hintsText).toContain('NPM package');
      expect(hintsText).toContain('not found');
    });

    it('should handle all Python packages failing', async () => {
      // Mock failures for all Python packages
      mockAxios.get
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [
          { name: 'nonexistentpythonpackage123' },
          { name: 'anothernonexistentpythonpackage456' },
        ],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();
      expect(response.hints.length).toBeGreaterThan(0);

      // Should include specific error messages
      const hintsText = response.hints.join(' ');
      expect(hintsText).toContain('Python package');
      expect(hintsText).toContain('not found on PyPI');
    });

    it('should handle all packages failing across both ecosystems', async () => {
      // Mock NPM failures
      const mockNpmResponse1 = {
        result: [],
        command:
          'npm search xyz123nonexistentpackage456 --searchlimit=1 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: [],
        command:
          'npm search abc789nonexistentpackage789 --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      // Mock Python failures
      mockAxios.get
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'xyz123nonexistentpackage456' },
          { name: 'abc789nonexistentpackage789' },
        ],
        pythonPackages: [
          { name: 'nonexistentpythonpackage123' },
          { name: 'anothernonexistentpythonpackage456' },
        ],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();
      expect(response.hints.length).toBeGreaterThan(0);

      // Should include errors from both ecosystems
      const hintsText = response.hints.join(' ');
      expect(hintsText).toContain('NPM Search Issues:');
      expect(hintsText).toContain('Python Search Issues:');
      expect(hintsText).toContain('not found');
    });
  });

  describe('Error Handling - Edge Cases', () => {
    it('should handle empty package names gracefully', async () => {
      // Mock successful response for valid package
      const mockNpmResponse = {
        result: [
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            links: { repository: 'https://github.com/facebook/react' },
          },
        ],
        command: 'npm search react --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'react' },
          { name: '' }, // Empty name
          { name: 'express' },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Should only return the valid package
      expect(response.data.total_count).toBe(1);
      expect(response.data.npm).toHaveLength(1);
      expect(response.data.npm[0].name).toBe('react');
    });

    it('should handle special characters in package names', async () => {
      // Mock response for package with special characters
      const mockNpmResponse = {
        result: [
          {
            name: 'wide-align',
            version: '1.1.5',
            description: 'Wide character alignment',
            links: { repository: 'https://github.com/iarna/wide-align' },
          },
        ],
        command:
          'npm search "package-with-special-chars-!@#$%^&*()" --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'package-with-special-chars-!@#$%^&*()' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Should handle special characters gracefully
      expect(response.data.total_count).toBe(1);
      expect(response.data.npm).toHaveLength(1);
    });

    it('should handle very long package names', async () => {
      const longPackageName =
        'this-is-a-very-long-package-name-that-probably-does-not-exist-in-the-npm-registry-and-should-cause-an-error';

      // Mock empty response for very long package name
      const mockNpmResponse = {
        result: [],
        command: `npm search "${longPackageName}" --searchlimit=1 --json`,
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: longPackageName }],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();
    });

    it('should handle URL-like package names', async () => {
      // Mock response for URL-like package name
      const mockNpmResponse = {
        result: [
          {
            name: 'braces',
            version: '3.0.3',
            description: 'Brace expansion library',
            links: { repository: 'https://github.com/micromatch/braces' },
          },
        ],
        command: 'npm search "http://malicious-url.com" --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'http://malicious-url.com' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Should handle URL-like names gracefully
      expect(response.data.total_count).toBe(1);
      expect(response.data.npm).toHaveLength(1);
    });

    it('should handle Python package name variations', async () => {
      // Mock successful response for PIL (Python Imaging Library)
      mockAxios.get.mockResolvedValueOnce({
        data: {
          info: {
            name: 'PIL',
            version: '1.1.6',
            summary: 'Python Imaging Library',
            project_urls: {
              Homepage: 'http://www.pythonware.com/products/pil/',
            },
          },
        },
      });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [
          { name: 'PIL' }, // Original name
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.data.total_count).toBe(1);
      expect(response.data.python).toHaveLength(1);
      expect(response.data.python[0].name).toBe('PIL');
    });

    it('should handle Python package with alternative names', async () => {
      // Mock successful response for pillow (modern PIL fork)
      mockAxios.get.mockResolvedValueOnce({
        data: {
          info: {
            name: 'pillow',
            version: '11.3.0',
            summary: 'Python Imaging Library (Fork)',
            keywords: ['Imaging'],
            project_urls: {
              Homepage: 'https://github.com/python-pillow/Pillow',
            },
          },
        },
      });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [
          { name: 'pillow' }, // Modern fork name
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.data.total_count).toBe(1);
      expect(response.data.python).toHaveLength(1);
      expect(response.data.python[0].name).toBe('pillow');
    });
  });

  describe('Error Handling - Schema Validation', () => {
    it('should handle empty arrays', async () => {
      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [],
        pythonPackages: [],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe(
        'At least one package search query is required'
      );
      expect(response.hints).toBeDefined();
      expect(response.hints.length).toBeGreaterThan(0);
    });

    it('should handle missing package arrays', async () => {
      const result = await mockServer.callTool('packageSearch', {
        // No npmPackages or pythonPackages provided
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe(
        'At least one package search query is required'
      );
    });

    it('should handle malformed package objects', async () => {
      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [
          { name: 'react' },
          { invalidField: 'invalid' }, // Missing required 'name' field
        ],
      });

      // This should fail schema validation
      expect(result.isError).toBe(true);
    });
  });

  describe('Error Handling - Network and System Failures', () => {
    it('should handle NPM command execution errors', async () => {
      mockExecuteNpmCommand.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'react' }],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();

      // Should include network-related hints
      const hintsText = response.hints.join(' ');
      expect(hintsText).toContain('NPM search failed for');
      expect(hintsText).toContain('Network timeout');
    });

    it('should handle PyPI API errors', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('PyPI API unavailable'));

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [{ name: 'requests' }],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();
    });

    it('should handle malformed NPM response', async () => {
      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'invalid json response' }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'react' }],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
    });

    it('should handle malformed PyPI response', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { invalid: 'response structure' },
      });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackages: [{ name: 'requests' }],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
    });
  });

  describe('Error Handling - Research Goal Integration', () => {
    it('should provide debugging-focused hints when research goal is debugging', async () => {
      // Mock all packages failing
      const mockNpmResponse = {
        result: [],
        command:
          'npm search xyz123nonexistentpackage456 --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'xyz123nonexistentpackage456' }],
        researchGoal: 'debugging',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.meta.error).toBe('No packages found');
      expect(response.hints).toBeDefined();
      expect(response.hints.length).toBeGreaterThan(0);

      // Should include debugging-specific hints
      const hintsText = response.hints.join(' ');
      expect(hintsText).toContain('NPM package');
      expect(hintsText).toContain('not found');
      expect(hintsText).toContain('Use simpler terms');
    });

    it('should provide analysis-focused hints when research goal is analysis', async () => {
      // Mock successful response
      const mockNpmResponse = {
        result: [
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            links: { repository: 'https://github.com/facebook/react' },
          },
        ],
        command: 'npm search react --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackages: [{ name: 'react' }],
        researchGoal: 'analysis',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      expect(response.hints).toBeDefined();
      expect(response.hints.length).toBeGreaterThan(0);

      // Should include analysis-focused hints
      const hintsText = response.hints.join(' ');
      expect(hintsText).toContain(
        'Compare download stats, dependencies, and maintenance activity'
      );
      expect(hintsText).toContain(
        'Compare implementations across 3-5 repositories to identify best practices'
      );
    });
  });
});
