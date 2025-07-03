import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';

describe('GitHub Search Code Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();

    // Default cache behavior
    mockWithCache.mockImplementation(async (key, fn) => await fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search code tool', () => {
      registerGitHubSearchCodeTool(mockServer.server);

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
          path: 'src/ReactDOMClient.js',
          repository: {
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          url: 'https://github.com/facebook/react/blob/main/src/ReactDOMClient.js',
          textMatches: [
            {
              fragment: 'defaultValue="test"',
              matches: [
                {
                  indices: [0, 12],
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
          'gh search code defaultValue repo:facebook/react --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      // Actually call the tool
      const result = await mockServer.callTool('githubSearchCode', {
        query: 'defaultValue',
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

      const mockCodeResults = [];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code useState org:facebook --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      // Actually call the tool
      const result = await mockServer.callTool('githubSearchCode', {
        query: 'useState',
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

      const mockCodeResults = [];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code Component repo:facebook/react --limit=20 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      // Actually call the tool
      const result = await mockServer.callTool('githubSearchCode', {
        query: 'Component',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'test',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'nonexistent',
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
              fragment: 'const [state, setState] = useState(false);',
              matches: [
                {
                  indices: [25, 33],
                },
              ],
            },
          ],
          sha: 'def456',
        },
      ];

      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code useState --language=typescript --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'useState',
        language: 'typescript',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.items).toBeDefined();
      expect(data.total_count).toBe(1);
    });

    it('should allow valid term counts (1-3 terms)', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [];
      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code react hook useState --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      // Test with exactly 3 terms (should be allowed)
      const result = await mockServer.callTool('githubSearchCode', {
        query: 'react hook useState',
      });

      expect(result.isError).toBe(true); // True because no results found, not validation error
      expect(result.content[0].text).toContain('No results found');
      expect(result.content[0].text).not.toContain('Too many search terms');
    });

    it('should handle search errors with helpful suggestions', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });

    it('should handle boolean operator validation', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [];
      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code "react or vue" --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'react or vue', // Boolean operators are now allowed
      });

      expect(result.isError).toBe(true); // True because no results found, not validation error
      expect(result.content[0].text).toContain('No results found');
    });

    it('should handle owner and repo parameters correctly', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [];
      const mockGitHubResponse = {
        result: mockCodeResults, // Direct array, not JSON string
        command:
          'gh search code test --repo=facebook/react --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'test',
        owner: 'facebook',
        repo: 'react',
        limit: 30, // Add explicit limit to match expected command
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'useState',
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
          'gh search code "react hook" --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'react hook',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'react hook',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: '"error handling"',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          '"error handling"',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'deque',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'cli',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'panic',
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'lint',
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
          'gh search code Component --extension=tsx --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'Component',
        extension: 'tsx',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'Component',
          '--extension=tsx',
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
          'gh search code function --size=<10 --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'function',
        size: '<10',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'function',
          '--size=<10',
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
          'gh search code component --match=file --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'component',
        match: 'file',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'component',
          '--match=file',
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
          'gh search code useState --language=typescript --owner=facebook --extension=tsx --limit=10 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'useState',
        language: 'typescript',
        owner: 'facebook',
        extension: 'tsx',
        limit: 10,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'useState',
          '--language=typescript',
          '--owner=facebook',
          '--extension=tsx',
          '--limit=10',
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
          'gh search code Component --repo=facebook/react --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'Component',
        owner: 'facebook',
        repo: 'react',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'Component',
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
          'gh search code "react component state hook" --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'react component state hook',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'react component state hook',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should build correct CLI for mixed quoted phrase and terms', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code "error handling" debug --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: '"error handling" debug',
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          '"error handling" debug',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
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
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'useState',
      });

      // Should not include --limit flag when using default
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        ['code', 'useState', '--json=repository,path,textMatches,sha,url'],
        { cache: false }
      );
    });

    it('should build correct CLI for multiple owners', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: [], // Direct array, not JSON string
        command:
          'gh search code api --owner=microsoft --owner=google --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'api',
        owner: ['microsoft', 'google'],
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'api',
          '--owner=microsoft',
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
          'gh search code test --repo=facebook/react --repo=microsoft/vscode --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      await mockServer.callTool('githubSearchCode', {
        query: 'test',
        repo: ['facebook/react', 'microsoft/vscode'],
        limit: 30,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--repo=facebook/react',
          '--repo=microsoft/vscode',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });
  });
});
