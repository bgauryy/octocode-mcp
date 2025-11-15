/**
 * Tests to ensure empty arrays are not included in responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { getTextContent } from '../utils/testHelpers.js';

const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());
const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/codeSearch.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
}));

vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/github/fileOperations.js', () => ({
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: vi.fn(),
  getServerConfig: mockGetServerConfig,
  getGitHubToken: vi.fn(() => Promise.resolve('mock-token')),
  isSamplingEnabled: mockIsSamplingEnabled,
  isLoggingEnabled: vi.fn(() => false),
}));

import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';
import { TOOL_NAMES } from '../../src/constants.js';

describe('Empty Arrays Removal in Responses', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();

    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: [],
      disableTools: [],
      enableLogging: false,
      betaEnabled: false,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: false,
    });
    mockIsSamplingEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('GitHub Search Code - Empty Results', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should not include empty files array in response', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: { items: [] }, // Empty result
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        {
          queries: [
            {
              keywordsToSearch: ['nonexistent'],
              reasoning: 'Test empty array removal',
            },
          ],
        },
        { authInfo: { token: 'mock-token' } }
      );

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test empty array removal"');
      expect(responseText).toContain('emptyStatusHints:');

      // Should not contain "files: []" or similar empty array indicators
      expect(responseText).not.toMatch(/files:\s*\[\]/);
      expect(responseText).not.toMatch(/files:\s*$/m);
    });
  });

  describe('GitHub Search Repositories - Empty Results', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should not include empty repositories array in response', async () => {
      mockSearchGitHubReposAPI.mockResolvedValueOnce({
        data: { repositories: [] }, // Empty result
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['nonexistent'],
              reasoning: 'Test empty array removal',
            },
          ],
        },
        { authInfo: { token: 'mock-token' } }
      );

      const responseText = getTextContent(result.content);

      // Should not contain "repositories: []"
      expect(responseText).not.toMatch(/repositories:\s*\[\]/);
      expect(responseText).not.toMatch(/repositories:\s*$/m);

      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('1 empty');
    });
  });

  describe('GitHub View Repository Structure - Empty Results', () => {
    beforeEach(() => {
      registerViewGitHubRepoStructureTool(mockServer.server);
    });

    it('should not include empty files or folders arrays in response', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValueOnce({
        files: [], // Empty files
        folders: { folders: [] }, // Empty folders
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              reasoning: 'Test empty arrays removal',
            },
          ],
        },
        { authInfo: { token: 'mock-token' } }
      );

      const responseText = getTextContent(result.content);

      // Should not contain "files: []" or "folders: []"
      expect(responseText).not.toMatch(/files:\s*\[\]/);
      expect(responseText).not.toMatch(/folders:\s*\[\]/);

      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('1 empty');
    });
  });

  describe('Mixed Results - Some Empty Arrays', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should not include empty arrays even when there are successful results', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                path: 'file1.js',
                matches: [{ context: 'test' }],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: { items: [] }, // Empty result
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        {
          queries: [
            { keywordsToSearch: ['found'], reasoning: 'Will have results' },
            { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          ],
        },
        { authInfo: { token: 'mock-token' } }
      );

      const responseText = getTextContent(result.content);

      // Should not have empty arrays anywhere
      expect(responseText).not.toMatch(/:\s*\[\]\s*$/m);

      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('1 hasResults, 1 empty');
    });
  });

  describe('Nested Empty Arrays', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should recursively remove all empty arrays', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          items: [
            {
              path: 'file1.js',
              matches: [], // Empty nested array - should be removed
            },
          ],
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              reasoning: 'Test nested empty arrays',
            },
          ],
        },
        { authInfo: { token: 'mock-token' } }
      );

      const responseText = getTextContent(result.content);

      // Should not contain any empty array syntax
      expect(responseText).not.toMatch(/:\s*\[\]\s*/);

      expect(responseText).toContain('file1.js');
    });
  });

  describe('Empty Hints Arrays', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should not include empty hints arrays', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              reasoning: 'Check hints structure',
            },
          ],
        },
        { authInfo: { token: 'mock-token' } }
      );

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('hasResultsStatusHints:');

      expect(responseText).toMatch(/hasResultsStatusHints:\s*\n\s*-/);

      expect(responseText).not.toMatch(/hasResultsStatusHints:\s*\[\]/);
    });
  });
});
