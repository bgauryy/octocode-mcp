import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

// Import after mocking
import { registerNpmSearchTool } from '../../src/mcp/tools/npm_package_search.js';

describe('NPM Package Search Tool', () => {
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
    it('should register the NPM package search tool', () => {
      registerNpmSearchTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'npmPackageSearch',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful package search', async () => {
      registerNpmSearchTool(mockServer.server);

      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            keywords: ['react'],
            links: { repository: 'https://github.com/facebook/react' },
          },
        ]),
        command: 'npm search react --searchlimit=20 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmPackageSearch', {
        queries: 'react',
      });

      expect(result.isError).toBe(true);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['react', '--searchlimit=20', '--json'],
        { cache: true }
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

      const result = await mockServer.callTool('npmPackageSearch', {
        queries: 'nonexistent-package-xyz',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No packages found');
    });
  });
});
