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
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

// Import after mocking
import { registerNpmSearchTool } from '../../src/mcp/tools/package_search.js';

describe('Package Search Tool (NPM & Python)', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Register the tool for testing with npmEnabled true
    registerNpmSearchTool(mockServer.server, {
      githubAPIType: 'gh',
      npmEnabled: true,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the package search tool', () => {
      registerNpmSearchTool(mockServer.server, {
        githubAPIType: 'gh',
        npmEnabled: true,
      });

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
        npmPackagesNames: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['react', '--searchlimit=1', '--json'],
        { cache: true }
      );

      // Check the result contains the NPM package
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(1);
      expect(data.npm).toHaveLength(1);
      expect(data.python).toHaveLength(0);
      expect(data.npm[0].name).toBe('react');
      expect(data.npm[0].version).toBe('18.2.0');
      expect(data.npm[0].repository).toBe('https://github.com/facebook/react');
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
        npmPackagesNames: 'nonexistent-package-xyz',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NPM Search Issues');
      expect(result.content[0].text).toContain(
        "NPM package 'nonexistent-package-xyz' not found"
      );
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
        pythonPackageName: 'requests',
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
      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(1);
      expect(data.npm || []).toHaveLength(0);
      expect(data.python).toHaveLength(1);
      expect(data.python[0].name).toBe('requests');
      expect(data.python[0].repository).toBe('https://github.com/psf/requests');
    });

    it('should handle Python package not found', async () => {
      // The tool is already registered in beforeEach with npmEnabled: true

      mockAxios.get.mockRejectedValue(new Error('404 Not Found'));

      const result = await mockServer.callTool('packageSearch', {
        pythonPackageName: 'nonexistent-python-package',
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0].text as string;
      expect(errorText).toContain('Python package');
      expect(errorText).toContain('not found on PyPI');
      expect(errorText).toContain('nonexistent-python-package');
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
        npmPackagesNames: ['typescript', 'eslint'],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(2);

      // Check both packages are in results
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(2);
      expect(data.npm).toHaveLength(2);
      expect(data.python).toHaveLength(0);
      expect(data.npm[0].name).toBe('typescript');
      expect(data.npm[1].name).toBe('eslint');
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
        npmPackageName: 'express',
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
        npmPackagesNames: ['react', 'router'],
        npmSearchStrategy: 'combined',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['react router', '--searchlimit=1', '--json'],
        { cache: true }
      );

      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toHaveLength(1);
      expect(data.npm[0].name).toBe('react-router');
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
        npmPackagesNames: '["lodash", "axios"]',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toHaveLength(2);
      expect(data.npm[0].name).toBe('lodash');
      expect(data.npm[1].name).toBe('axios');
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
        npmPackagesNames: 'moment, dayjs',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toHaveLength(2);
      expect(data.npm[0].name).toBe('moment');
      expect(data.npm[1].name).toBe('dayjs');
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
      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toHaveLength(2);
      expect(data.npm[0].name).toBe('react');
      expect(data.npm[1].name).toBe('vue');

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
      const data = JSON.parse(result.content[0].text as string);
      expect(data.python).toHaveLength(2);
      expect(data.python[0].name).toBe('requests');
      expect(data.python[1].name).toBe('django');
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
      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toHaveLength(1);
      expect(data.python).toHaveLength(1);
      expect(data.npm[0].name).toBe('express');
      expect(data.python[0].name).toBe('flask');
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

    it('should handle NPM metadata fetching for specific queries', async () => {
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
      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toBeDefined();
      expect(data.npm.typescript).toBeDefined();
      expect(data.npm.typescript.metadata).toBeDefined();
      expect(data.npm.typescript.gitURL).toContain('microsoft/typescript');
    });
  });

  describe('Backward Compatibility', () => {
    it('should still support legacy npmPackageName parameter', async () => {
      const mockNpmResponse = {
        result: [
          {
            name: 'lodash',
            version: '4.17.21',
            description: 'Utility library',
            links: { repository: 'https://github.com/lodash/lodash' },
          },
        ],
        command: 'npm search lodash --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackageName: 'lodash', // Legacy parameter
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.npm).toHaveLength(1);
      expect(data.npm[0].name).toBe('lodash');
    });

    it('should still support legacy pythonPackageName parameter', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          info: {
            name: 'numpy',
            version: '1.24.0',
            summary: 'NumPy array library',
            project_urls: {
              Source: 'https://github.com/numpy/numpy',
            },
          },
        },
      });

      const result = await mockServer.callTool('packageSearch', {
        pythonPackageName: 'numpy', // Legacy parameter
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.python).toHaveLength(1);
      expect(data.python[0].name).toBe('numpy');
    });

    it('should detect format conflict and provide helpful error', async () => {
      const result = await mockServer.callTool('packageSearch', {
        // No parameters provided
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0].text as string;
      expect(
        errorText.includes('FALLBACK:') ||
          errorText.includes('CUSTOM:') ||
          errorText.includes('format') ||
          errorText.includes('npmPackages') ||
          errorText.includes('legacy')
      ).toBe(true);
    });
  });
});
