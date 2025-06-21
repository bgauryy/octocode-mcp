import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerApiStatusCheckTool } from '../../src/mcp/tools/api_status_check.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import type { MockMcpServer } from '../fixtures/mcp-fixtures.js';

const TOOL_NAMES = {
  API_STATUS_CHECK: 'api_status_check',
} as const;

interface ApiStatusResponse {
  status: string;
  github: {
    connected: boolean;
    organizations: string[];
  };
  npm: {
    connected: boolean;
    registry: string;
  };
  summary: string;
}

// Mock the exec utilities
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: vi.fn(),
  executeNpmCommand: vi.fn(),
}));

describe('API Status Check Tool', () => {
  let mockServer: MockMcpServer;
  let mockExecuteGitHubCommand: any;
  let mockExecuteNpmCommand: any;

  beforeEach(async () => {
    mockServer = createMockMcpServer();

    // Get references to the mocked functions before registration
    const execModule = await import('../../src/utils/exec.js');
    mockExecuteGitHubCommand = vi.mocked(execModule.executeGitHubCommand);
    mockExecuteNpmCommand = vi.mocked(execModule.executeNpmCommand);

    // Clear only the exec mocks, not the server mocks
    mockExecuteGitHubCommand.mockClear();
    mockExecuteNpmCommand.mockClear();

    // Register tool after getting references to mocked functions
    registerApiStatusCheckTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Tool Registration', () => {
    it('should register the API status check tool', () => {
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        TOOL_NAMES.API_STATUS_CHECK,
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({
            title: 'Check API Connections and Github Organizations',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('GitHub Authentication', () => {
    it('should detect successful GitHub authentication with organizations', async () => {
      // Mock successful GitHub auth
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'Logged in to github.com' }) },
          ],
        })
        // Mock successful organizations fetch
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: 'org1\norg2\norg3' }) }],
        });

      // Mock NPM failure
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(result.isError).toBe(false);
      expect(data).toEqual({
        status: 'PARTIAL',
        github: {
          connected: true,
          organizations: ['org1', 'org2', 'org3'],
        },
        npm: {
          connected: false,
          registry: '',
        },
        summary: expect.any(String)
      });
    });

    it('should handle GitHub authentication without organizations', async () => {
      // Mock successful GitHub auth
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'Logged in to github.com' }) },
          ],
        })
        // Mock failed organizations fetch
        .mockRejectedValueOnce(new Error('Organizations fetch failed'));

      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.github).toEqual({
        connected: true,
        organizations: [],
      });
    });

    it('should detect failed GitHub authentication', async () => {
      // Mock failed GitHub auth
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: true,
        content: [{ text: 'Authentication failed' }],
      });

      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.github).toEqual({
        connected: false,
        organizations: [],
      });
    });

    it('should handle GitHub CLI not available', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('gh: command not found')
      );
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.github).toEqual({
        connected: false,
        organizations: [],
      });
    });
  });

  describe('NPM Authentication', () => {
    it('should detect successful NPM authentication with registry', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );

      // Mock successful NPM whoami
      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: 'testuser' }) }],
        })
        // Mock successful registry fetch
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'https://registry.npmjs.org/' }) },
          ],
        });

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.npm).toEqual({
        connected: true,
        registry: 'https://registry.npmjs.org/',
      });
    });

    it('should handle NPM authentication without registry info', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );

      // Mock successful NPM whoami
      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: 'testuser' }) }],
        })
        // Mock failed registry fetch
        .mockRejectedValueOnce(new Error('Registry fetch failed'));

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.npm).toEqual({
        connected: true,
        registry: 'https://registry.npmjs.org/', // fallback
      });
    });

    it('should detect failed NPM authentication', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('npm whoami failed')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.npm).toEqual({
        connected: false,
        registry: '',
      });
    });
  });

  describe('Full Authentication Scenarios', () => {
    it('should handle both GitHub and NPM authenticated', async () => {
      // Mock successful GitHub auth with orgs
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'Logged in to github.com' }) },
          ],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: 'myorg\nmycompany' }) }],
        });

      // Mock successful NPM auth
      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: 'myusername' }) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'https://npm.company.com/' }) },
          ],
        });

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(result.isError).toBe(false);
      expect(data).toEqual({
        status: 'CONNECTED',
        github: {
          connected: true,
          organizations: ['myorg', 'mycompany'],
        },
        npm: {
          connected: true,
          registry: 'https://npm.company.com/',
        },
        summary: expect.any(String)
      });
    });

    it('should handle neither GitHub nor NPM authenticated', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not authenticated')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(result.isError).toBe(false);
      expect(data).toEqual({
        status: 'DISCONNECTED',
        github: {
          connected: false,
          organizations: [],
        },
        npm: {
          connected: false,
          registry: '',
        },
        summary: expect.any(String)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error during execution
      mockExecuteGitHubCommand.mockImplementationOnce(() => {
        throw new Error('Unexpected error during GitHub check');
      });

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API status check failed');
      expect(result.content[0].text).toContain('Unexpected error during GitHub check');
    });

    it('should handle malformed JSON responses', async () => {
      // Mock malformed JSON response
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'not valid json' }],
      });

      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API status check failed');
    });
  });

  describe('Organization Parsing', () => {
    it('should filter empty organization names', async () => {
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'Logged in to github.com' }) },
          ],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'org1\n\norg2\n  \norg3\n' }) },
          ],
        });

      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.github.organizations).toEqual(['org1', 'org2', 'org3']);
    });

    it('should handle empty organizations response', async () => {
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [
            { text: JSON.stringify({ result: 'Logged in to github.com' }) },
          ],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: '' }) }],
        });

      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const data = parseResultJson<ApiStatusResponse>(result);

      expect(data.github.organizations).toEqual([]);
    });
  });
});
