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
import { registerNpmViewPackageTool } from '../../src/mcp/tools/npm_view_package.js';

describe('NPM View Package Tool', () => {
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
    it('should register the NPM view package tool', () => {
      registerNpmViewPackageTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'npmViewPackage',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful package view', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: JSON.stringify({
          name: 'react',
          'dist-tags': { latest: '18.2.0' },
          description: 'React library',
          repository: { url: 'https://github.com/facebook/react' },
          license: 'MIT',
          time: {
            created: '2011-10-26T17:46:21.942Z',
            modified: '2022-06-14T17:00:00.000Z',
          },
          dist: {
            tarball: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz',
          },
          exports: {},
        }),
        command: 'npm view react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', '--json'],
        { cache: false }
      );
    });

    it('should handle package not found', async () => {
      registerNpmViewPackageTool(mockServer.server);

      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Package not found' }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'nonexistent-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package not found');
    });

    it('should handle empty package name', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to fetch package ""');
    });
  });
});
