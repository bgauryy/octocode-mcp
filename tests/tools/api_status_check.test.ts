import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

// Import after mocking
import { registerApiStatusCheckTool } from '../../src/mcp/tools/api_status_check.js';

describe('API Status Check Tool', () => {
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
    it('should register the API status check tool', () => {
      registerApiStatusCheckTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'api_status_check',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful status check', async () => {
      registerApiStatusCheckTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          login: 'testuser',
          id: 12345,
          type: 'User',
        }),
        command: 'gh api user',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('api_status_check', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith('auth', ['status']);
    });

    it('should handle authentication failure', async () => {
      registerApiStatusCheckTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Not authenticated' }],
      });

      const result = await mockServer.callTool('api_status_check', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Not connected');
    });
  });
});
