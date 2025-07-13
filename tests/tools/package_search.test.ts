import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

vi.mock('child_process', () => ({
  exec: mockExec,
}));

vi.mock('util', () => ({
  promisify: () => mockExec,
}));

// Import after mocking
import { registerNpmSearchTool } from '../../src/mcp/tools/package_search.js';

describe('Package Search Tool (NPM & Python)', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the package search tool', () => {
      registerNpmSearchTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'packageSearch',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('NPM Package Search', () => {
    it('should handle successful package search', async () => {
      registerNpmSearchTool(mockServer.server);

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
        command: 'npm search react --searchlimit=20 --json',
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
        ['react', '--searchlimit=20', '--json'],
        { cache: true }
      );

      // Check the result contains the NPM package
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(1);
      expect(data.results[0].name).toBe('react');
      expect(data.results[0].version).toBe('18.2.0');
      expect(data.results[0].repository).toBe(
        'https://github.com/facebook/react'
      );
    });

    it('should handle no packages found', async () => {
      registerNpmSearchTool(mockServer.server);

      const mockNpmResponse = {
        result: '[]', // Empty results
        command: 'npm search nonexistent-package-xyz --searchlimit=20 --json',
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
      expect(result.content[0].text).toContain(
        'Package not found on NPM registry'
      );
    });
  });

  describe('Python Package Search', () => {
    it('should handle successful Python package search', async () => {
      registerNpmSearchTool(mockServer.server);

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

      mockExec.mockResolvedValue({
        stdout: JSON.stringify(mockPyPIResponse),
        stderr: '',
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackagesNames: 'requests',
        pythonPackageName: 'requests',
      });

      expect(result.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        'curl -s https://pypi.org/pypi/requests/json'
      );

      // Check the result contains the Python package
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(1);
      expect(data.results[0].name).toBe('requests');
      expect(data.results[0].repository).toBe(
        'https://github.com/psf/requests'
      );
    });

    it('should handle Python package not found', async () => {
      registerNpmSearchTool(mockServer.server);

      mockExec.mockRejectedValue(new Error('404 Not Found'));

      const result = await mockServer.callTool('packageSearch', {
        npmPackagesNames: 'nonexistent-python-package',
        pythonPackageName: 'nonexistent-python-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Package not found on NPM registry'
      );
      // Should include suggestion to try NPM instead
      expect(result.content[0].text).toContain(
        'Try searching with npmPackageName if this is an NPM package'
      );
    });
  });

  describe('Multiple NPM Package Search', () => {
    it('should handle array of search queries', async () => {
      registerNpmSearchTool(mockServer.server);

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
        command: 'npm search typescript --searchlimit=20 --json',
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
        command: 'npm search eslint --searchlimit=20 --json',
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
      expect(data.results).toHaveLength(2);
      expect(data.results[0].name).toBe('typescript');
      expect(data.results[1].name).toBe('eslint');
    });

    it('should handle single npm package with npmPackageName parameter', async () => {
      registerNpmSearchTool(mockServer.server);

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
        command: 'npm search express --searchlimit=20 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('packageSearch', {
        npmPackagesNames: [],
        npmPackageName: 'express',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['express', '--searchlimit=20', '--json'],
        { cache: true }
      );
    });
  });
});
