import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
  executeNpmCommand: mockExecuteNpmCommand,
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
        'apiStatusCheck',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should return structured login status with both GitHub and NPM connected', async () => {
      registerApiStatusCheckTool(mockServer.server);

      // Mock GitHub auth success
      mockExecuteGitHubCommand.mockImplementation((command, args) => {
        if (command === 'auth' && args[0] === 'status') {
          return Promise.resolve({
            isError: false,
            content: [{ text: JSON.stringify({ result: 'Logged in to github.com account testuser' }) }],
          });
        }
        if (command === 'org' && args[0] === 'list') {
          return Promise.resolve({
            isError: false,
            content: [{ text: JSON.stringify({ result: 'org1\norg2\norg3' }) }],
          });
        }
        return Promise.resolve({ isError: true, content: [] });
      });

      // Mock NPM success
      mockExecuteNpmCommand.mockImplementation((command, args) => {
        if (command === 'whoami') {
          return Promise.resolve({
            isError: false,
            content: [{ text: JSON.stringify({ result: 'testuser' }) }],
          });
        }
        if (command === 'config' && args[0] === 'get' && args[1] === 'registry') {
          return Promise.resolve({
            isError: false,
            content: [{ text: JSON.stringify({ result: 'https://registry.npmjs.org/' }) }],
          });
        }
        return Promise.resolve({ isError: true, content: [] });
      });

      const result = await mockServer.callTool('apiStatusCheck', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.login).toBeDefined();
      expect(responseData.login.github.connected).toBe(true);
      expect(responseData.login.github.user_organizations).toEqual(['org1', 'org2', 'org3']);
      expect(responseData.login.npm.connected).toBe(true);
      expect(responseData.login.npm.registry).toBe('https://registry.npmjs.org/');
      expect(responseData.login.hints).toHaveLength(1);
    });

    it('should return structured login status with GitHub disconnected and NPM connected', async () => {
      registerApiStatusCheckTool(mockServer.server);

      // Mock GitHub auth failure
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Not authenticated' }],
      });

      // Mock NPM success
      mockExecuteNpmCommand.mockImplementation((command, args) => {
        if (command === 'whoami') {
          return Promise.resolve({
            isError: false,
            content: [{ text: JSON.stringify({ result: 'testuser' }) }],
          });
        }
        if (command === 'config' && args[0] === 'get' && args[1] === 'registry') {
          return Promise.resolve({
            isError: false,
            content: [{ text: JSON.stringify({ result: 'https://registry.npmjs.org/' }) }],
          });
        }
        return Promise.resolve({ isError: true, content: [] });
      });

      const result = await mockServer.callTool('apiStatusCheck', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.login.github.connected).toBe(false);
      expect(responseData.login.github.user_organizations).toEqual([]);
      expect(responseData.login.npm.connected).toBe(true);
      expect(responseData.login.npm.registry).toBe('https://registry.npmjs.org/');
    });

    it('should return structured login status with both services disconnected', async () => {
      registerApiStatusCheckTool(mockServer.server);

      // Mock both services failure
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Not authenticated' }],
      });

      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Not authenticated' }],
      });

      const result = await mockServer.callTool('apiStatusCheck', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.login.github.connected).toBe(false);
      expect(responseData.login.github.user_organizations).toEqual([]);
      expect(responseData.login.npm.connected).toBe(false);
      expect(responseData.login.npm.registry).toBe('https://registry.npmjs.org/');
    });

    it('should handle JSON parsing errors gracefully', async () => {
      registerApiStatusCheckTool(mockServer.server);

      // Mock GitHub with invalid JSON that should propagate error
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: 'invalid json' }],
      });

      const result = await mockServer.callTool('apiStatusCheck', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.login.github.connected).toBe(false);
      expect(responseData.login.npm.connected).toBe(false);
    });
  });
});
