import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerApiStatusCheckTool } from '../../src/mcp/tools/api_status_check/api_status_check.js';
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

// Helper function to parse the new simple string response
function parseSimpleResponse(response: string): {
  npmConnected: boolean;
  githubConnected: boolean;
  organizations: string[];
} {
  const lines = response.split('\n');
  const npmConnected = lines[0]?.includes('NPM connected: true') || false;
  const githubConnected = lines[1]?.includes('GitHub connected: true') || false;
  
  const organizations: string[] = [];
  let inOrgSection = false;
  
  for (const line of lines) {
    if (line.includes('User organizations')) {
      inOrgSection = true;
      continue;
    }
    if (inOrgSection && line.startsWith('- ')) {
      organizations.push(line.substring(2));
    }
  }
  
  return { npmConnected, githubConnected, organizations };
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
      
      expect(result.isError).toBe(false);
      
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);
      
      expect(parsed.npmConnected).toBe(false);
      expect(parsed.githubConnected).toBe(true);
      expect(parsed.organizations).toEqual(['org1', 'org2', 'org3']);
      expect(responseText).toContain('NPM connected: false');
      expect(responseText).toContain('GitHub connected: true');
      expect(responseText).toContain('User organizations (use as owner for private repo search):');
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
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.githubConnected).toBe(true);
      expect(parsed.organizations).toEqual([]);
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
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.githubConnected).toBe(false);
      expect(parsed.organizations).toEqual([]);
    });

    it('should handle GitHub CLI not available', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('gh: command not found')
      );
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.githubConnected).toBe(false);
      expect(parsed.organizations).toEqual([]);
    });
  });

  describe('NPM Authentication', () => {
    it('should detect successful NPM authentication', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );

      // Mock successful NPM whoami
      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify({ result: 'testuser' }) }],
      });

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.npmConnected).toBe(true);
      expect(responseText).toContain('NPM connected: true');
    });

    it('should detect failed NPM authentication', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('npm whoami failed')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.npmConnected).toBe(false);
      expect(responseText).toContain('NPM connected: false');
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
      mockExecuteNpmCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify({ result: 'myusername' }) }],
      });

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(result.isError).toBe(false);
      expect(parsed.npmConnected).toBe(true);
      expect(parsed.githubConnected).toBe(true);
      expect(parsed.organizations).toEqual(['myorg', 'mycompany']);
      expect(responseText).toContain('NPM connected: true');
      expect(responseText).toContain('GitHub connected: true');
    });

    it('should handle neither GitHub nor NPM authenticated', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not available')
      );
      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not authenticated')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(result.isError).toBe(false);
      expect(parsed.npmConnected).toBe(false);
      expect(parsed.githubConnected).toBe(false);
      expect(parsed.organizations).toEqual([]);
      expect(responseText).toContain('NPM connected: false');
      expect(responseText).toContain('GitHub connected: false');
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error during execution that escapes the inner try-catch
      mockExecuteGitHubCommand.mockImplementationOnce(() => {
        throw new Error('Unexpected error during GitHub check');
      });

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);

      // The new implementation catches GitHub errors and continues, so this should succeed
      expect(result.isError).toBe(false);
      const responseText = result.content[0].text;
      expect(responseText).toContain('GitHub connected: false');
    });

    it('should handle malformed JSON responses gracefully', async () => {
      // Mock malformed JSON response - this should be caught and handled
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'not valid json' }],
      });

      mockExecuteNpmCommand.mockRejectedValueOnce(
        new Error('NPM not available')
      );

      const result = await mockServer.callTool(TOOL_NAMES.API_STATUS_CHECK);

      // The new implementation catches JSON errors and treats GitHub as disconnected
      expect(result.isError).toBe(false);
      const responseText = result.content[0].text;
      expect(responseText).toContain('GitHub connected: false');
      expect(responseText).toContain('NPM connected: false');
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
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.organizations).toEqual(['org1', 'org2', 'org3']);
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
      const responseText = result.content[0].text;
      const parsed = parseSimpleResponse(responseText);

      expect(parsed.organizations).toEqual([]);
    });
  });
});
