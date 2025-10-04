/**
 * Tests to ensure empty arrays are not included in responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());
const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/index.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: vi.fn(),
  getServerConfig: mockGetServerConfig,
  isSamplingEnabled: mockIsSamplingEnabled,
  isLoggingEnabled: vi.fn(() => false),
}));

import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';

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

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['nonexistent'],
            reasoning: 'Test empty array removal',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      // Should not contain "files: []" or similar empty array indicators
      expect(responseText).not.toMatch(/files:\s*\[\]/);
      expect(responseText).not.toMatch(/files:\s*$/m);

      // Should contain empty section with the query but no files field
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('1 empty');
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

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['nonexistent'],
            reasoning: 'Test empty array removal',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      // Should not contain "repositories: []"
      expect(responseText).not.toMatch(/repositories:\s*\[\]/);
      expect(responseText).not.toMatch(/repositories:\s*$/m);

      // Should contain empty section
      expect(responseText).toContain('empty:');
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

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            reasoning: 'Test empty arrays removal',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      // Should not contain "files: []" or "folders: []"
      expect(responseText).not.toMatch(/files:\s*\[\]/);
      expect(responseText).not.toMatch(/folders:\s*\[\]/);

      // Should contain empty section
      expect(responseText).toContain('empty:');
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

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will have results' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
        ],
      });

      const responseText = result.content[0]?.text as string;

      // Should not have empty arrays anywhere
      expect(responseText).not.toMatch(/:\s*\[\]\s*$/m);

      // Should have both successful and empty sections
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('1 successful, 1 empty');
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

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Test nested empty arrays',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      // Should not contain any empty array syntax
      expect(responseText).not.toMatch(/:\s*\[\]\s*/);

      // File should still be present but without empty matches field
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

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Check hints structure',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      // Hints should exist and not be empty
      expect(responseText).toContain('hints:');
      expect(responseText).toContain('successful:');

      // Should have actual hints (array with content)
      expect(responseText).toMatch(/successful:\s*\n\s*-/);

      // Should not have empty hint sections
      expect(responseText).not.toMatch(/successful:\s*\[\]/);
      expect(responseText).not.toMatch(/empty:\s*\[\]/);
      expect(responseText).not.toMatch(/failed:\s*\[\]/);
    });
  });
});
