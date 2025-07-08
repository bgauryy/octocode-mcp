import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';
import { executeGitHubCommand } from '../../src/utils/exec.js';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Mock the exec module
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: vi.fn(),
}));

// Mock the cache module
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withCache: vi.fn((_key, fn) => fn()),
}));

const mockExecuteGitHubCommand = vi.mocked(executeGitHubCommand);

describe('GitHub Search Code Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search code tool', () => {
      registerGitHubSearchCodeTool(mockServer.server);

      // Verify the tool was registered
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchCode',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Parameter Handling', () => {
    it('should properly combine owner and repo parameters', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [
        {
          path: 'src/useState.js',
          repository: {
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          url: 'https://github.com/facebook/react/blob/main/src/useState.js',
          textMatches: [
            {
              fragment:
                'function useState(initialValue) { return [initialValue, function(){}]; }',
              matches: [
                {
                  indices: [9, 17],
                },
              ],
            },
          ],
          sha: 'abc123',
        },
      ];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code defaultValue --repo=facebook/react --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      // Actually call the tool
      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'defaultValue',
        owner: 'facebook',
        repo: 'react',
        limit: 20,
      });

      expect(result.isError).toBe(false);
      // Verify the correct command is generated
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'defaultValue',
          '--repo=facebook/react',
          '--limit=20',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should use org: qualifier when only owner is provided', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults: any[] = [];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code useState --owner=facebook --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      // Actually call the tool
      const result = await mockServer.callTool('githubSearchCode', {
        queryTerms: ['useState'],
        owner: 'facebook',
        limit: 20,
      });

      expect(result.isError).toBe(true); // No results should be an error
      // Verify the correct command is generated
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'useState',
          '--owner=facebook',
          '--limit=20',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should use repo: qualifier when repo is provided in owner/repo format', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults: any[] = [];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code Component --repo=facebook/react --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      // Actually call the tool
      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'Component',
        repo: 'facebook/react',
        limit: 20,
      });

      expect(result.isError).toBe(true); // No results should be an error
      // Verify the correct command is generated
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'Component',
          '--repo=facebook/react',
          '--limit=20',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful code search', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      // GitHub CLI returns an array directly for code search
      const mockCodeResults = [
        {
          path: 'src/test.js',
          repository: {
            nameWithOwner: 'owner/repo',
            url: 'https://github.com/owner/repo',
          },
          url: 'https://github.com/owner/repo/blob/main/src/test.js',
          textMatches: [
            {
              fragment: 'function test() { return true; }',
              matches: [
                {
                  indices: [9, 13],
                },
              ],
            },
          ],
          sha: 'abc123',
        },
      ];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code test --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'test',
        limit: 30,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );

      const data = JSON.parse(result.content[0].text as string);
      expect(data.items).toBeDefined();
      expect(data.total_count).toBe(1);
    });

    it('should handle no results found with smart suggestions', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Empty array for no results
        command:
          'gh search code nonexistent --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No results');
    });

    it('should handle search with language filter and provide efficiency metadata', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [
        {
          path: 'src/component.tsx',
          repository: {
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          url: 'https://github.com/facebook/react/blob/main/src/component.tsx',
          textMatches: [
            {
              fragment: 'const Component = () => { return <div>test</div>; }',
              matches: [
                {
                  indices: [6, 15],
                },
              ],
            },
          ],
          sha: 'xyz789',
        },
      ];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code Component --language=typescript --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'Component',
        language: 'typescript',
        limit: 20,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.items).toBeDefined();
      expect(data.total_count).toBe(1);
    });

    it('should allow valid term counts (1-3 terms)', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Empty array
        command:
          'gh search code react hooks typescript --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queryTerms: ['react', 'hooks', 'typescript'],
      });

      expect(result.isError).toBe(true); // True because no results found, not validation error
      expect(result.content[0].text).toContain('No results found');
      expect(result.content[0].text).not.toContain('Too many search terms');
    });

    it('should handle search errors with helpful suggestions', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      mockExecuteGitHubCommand.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('rate limit');
    });

    it('should handle boolean operator validation', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Empty array
        command:
          'gh search code react AND hooks --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queryTerms: ['react', 'AND', 'hooks'],
      });

      expect(result.isError).toBe(true); // True because no results found, not validation error
      expect(result.content[0].text).toContain('No results found');
    });

    it('should handle owner and repo parameters correctly', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Empty array
        command:
          'gh search code test --repo=facebook/react --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'test',
        owner: 'facebook',
        repo: 'react',
      });

      expect(result.isError).toBe(true); // True because no results found, not validation error
      expect(result.content[0].text).toContain('No results found');

      // Verify the correct command was generated
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--repo=facebook/react',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should require at least one search parameter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCode', {
        language: 'typescript',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'One search parameter required: exactQuery OR queryTerms'
      );
    });
  });

  describe('CLI Command Structure Verification', () => {
    // These tests verify that the tool generates the correct GitHub CLI commands
    // based on the official GitHub CLI documentation

    it('should build correct CLI for single term search', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code useState --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        queryTerms: ['useState'],
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'useState',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for multiple terms search (AND logic)', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code react hook --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        queryTerms: ['react', 'hook'],
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'react',
          'hook',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for exact phrase search', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code "error handling" --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'error handling',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'error handling',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for language filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code deque --language=python --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'deque',
        language: 'python',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'deque',
          '--language=python',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for owner filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code cli --owner=microsoft --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'cli',
        owner: 'microsoft',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'cli',
          '--owner=microsoft',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for repo filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code panic --repo=cli/cli --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'panic',
        repo: 'cli/cli',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'panic',
          '--repo=cli/cli',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for filename filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code lint --filename=package.json --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'lint',
        filename: 'package.json',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'lint',
          '--filename=package.json',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for extension filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code function --extension=js --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'function',
        extension: 'js',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'function',
          '--extension=js',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for size filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code class --size=>1000 --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'class',
        size: '>1000',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'class',
          '--size=>1000',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for match filter', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code test --match=path --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'test',
        match: 'path',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--match=path',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for multiple filters combined', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code useState --language=typescript --owner=facebook --filename=*.tsx --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'useState',
        language: 'typescript',
        owner: 'facebook',
        filename: '*.tsx',
        limit: 20,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'useState',
          '--language=typescript',
          '--owner=facebook',
          '--filename=*.tsx',
          '--limit=20',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for owner + repo combination', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code component --repo=facebook/react --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'component',
        owner: 'facebook',
        repo: 'react',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'component',
          '--repo=facebook/react',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for complex multi-term search', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code react functional component --language=typescript --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        queryTerms: ['react', 'functional', 'component'],
        language: 'typescript',
        limit: 20,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'react',
          'functional',
          'component',
          '--language=typescript',
          '--limit=20',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should reject using both exactQuery and queryTerms together', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCode', {
        exactQuery: 'error handling',
        queryTerms: ['async'],
        language: 'javascript',
        limit: 15,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Use either exactQuery OR queryTerms, not both'
      );
    });

    it('should build correct CLI with default limit when not specified', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code useState --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'useState',
      });

      // Should include --limit=30 (default)
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'useState',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for multiple owners', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code api --owner=facebook --owner=google --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'api',
        owner: ['facebook', 'google'],
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'api',
          '--owner=facebook',
          '--owner=google',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for multiple repos', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code hook --repo=facebook/react --repo=vuejs/vue --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        exactQuery: 'hook',
        repo: ['facebook/react', 'vuejs/vue'],
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'hook',
          '--repo=facebook/react',
          '--repo=vuejs/vue',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });
  });
});
