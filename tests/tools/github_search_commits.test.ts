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
import { registerGitHubSearchCommitsTool } from '../../src/mcp/tools/github_search_commits.js';

describe('GitHub Search Commits Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();

    // Default cache behavior
    // @ts-expect-error - mockWithCache is not typed
    mockWithCache.mockImplementation(async (key, fn) => await fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search commits tool', () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchCommits',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Query Types', () => {
    it('should handle multiple queryTerms (AND logic)', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: 'readme123',
            commit: {
              message: 'fix: typo in readme',
              author: { name: 'Test Author', date: '2023-01-01T00:00:00Z' },
            },
            repository: {
              fullName: 'owner/repo',
              url: 'https://github.com/owner/repo',
            },
            url: 'https://github.com/owner/repo/commit/readme123',
          },
        ],
        command: 'gh search commits readme typo --json ...',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        queryTerms: ['readme', 'typo'],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          'readme typo',
          '--limit=100',
          '--json=sha,commit,author,committer,repository,url,parents',
        ],
        { cache: false }
      );
    });

    it('should handle exactQuery (phrase search)', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: 'bugfix123',
            commit: {
              message: 'fix: critical bug fix for login',
              author: { name: 'Test Author', date: '2023-01-01T00:00:00Z' },
            },
            repository: {
              fullName: 'owner/repo',
              url: 'https://github.com/owner/repo',
            },
            url: 'https://github.com/owner/repo/commit/bugfix123',
          },
        ],
        command: 'gh search commits "bug fix" --json ...',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'bug fix',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          '"bug fix"',
          '--limit=100',
          '--json=sha,commit,author,committer,repository,url,parents',
        ],
        { cache: false }
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful commit search', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: 'abc123',
            commit: {
              message: 'fix: resolve bug',
              author: { name: 'Test Author', date: '2023-01-01T00:00:00Z' },
            },
            repository: {
              fullName: 'owner/repo',
              url: 'https://github.com/owner/repo',
            },
            url: 'https://github.com/owner/repo/commit/abc123',
          },
        ],
        command: 'gh search commits fix --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'fix',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          '"fix"',
          '--limit=100',
          '--json=sha,commit,author,committer,repository,url,parents',
        ],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [],
        command: 'gh search commits nonexistent --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });

    it('should handle getChangesContent parameter for repo-specific searches', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockCommitSearchResponse = {
        result: [
          {
            sha: 'abc123def456',
            commit: {
              message: 'fix: resolve bug in component',
              author: { name: 'Test Author', date: '2023-01-01T00:00:00Z' },
            },
            repository: {
              fullName: 'owner/repo',
              url: 'https://github.com/owner/repo',
            },
            url: 'https://github.com/owner/repo/commit/abc123def456',
          },
        ],
        command: 'gh search commits fix --repo owner/repo --json ...',
        type: 'github',
      };

      const mockCommitDetailResponse = {
        result: {
          sha: 'abc123def456',
          stats: {
            additions: 15,
            deletions: 8,
            total: 23,
          },
          files: [
            {
              filename: 'src/component.js',
              status: 'modified',
              additions: 15,
              deletions: 8,
              changes: 23,
              patch:
                '@@ -1,8 +1,15 @@\n function component() {\n   console.log("fixed");',
            },
          ],
        },
        command: 'gh api /repos/owner/repo/commits/abc123def456',
        type: 'github',
      };

      // Mock commit search call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockCommitSearchResponse) }],
      });

      // Mock commit detail call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockCommitDetailResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'fix',
        owner: 'owner',
        repo: 'repo',
        getChangesContent: true,
      });

      expect(result.isError).toBe(false);

      // Should call commit search first
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        1,
        'search',
        expect.arrayContaining([
          'commits',
          '"fix"',
          '--repo=owner/repo',
          '--limit=100',
          '--json=sha,commit,author,committer,repository,url,parents',
        ]),
        { cache: false }
      );

      // Should call commit detail API second
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'api',
        ['/repos/owner/repo/commits/abc123def456'],
        { cache: false }
      );

      // Result should contain diff information
      const data = JSON.parse(result.content[0].text as string);
      expect(data.commits[0].diff).toBeDefined();
      expect(data.commits[0].diff.changed_files).toBe(1);
      expect(data.commits[0].diff.files[0].filename).toBe('src/component.js');
      expect(data.commits[0].diff.total_changes).toBe(23);
    });

    it('should handle filter-only search without query', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: 'def456',
            commit: {
              message: 'feat: add new feature',
              author: { name: 'Monalisa', date: '2023-02-01T00:00:00Z' },
            },
            repository: {
              fullName: 'octocat/hello-world',
              url: 'https://github.com/octocat/hello-world',
            },
            url: 'https://github.com/octocat/hello-world/commit/def456',
          },
        ],
        command: 'gh search commits --committer=monalisa --json ...',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        committer: 'monalisa',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['commits', '--committer=monalisa']),
        { cache: false }
      );

      const data = JSON.parse(result.content[0].text as string);
      expect(data.commits).toHaveLength(1);
      expect(data.commits[0].author).toBe('Monalisa');
    });

    it('should handle date-based filter without query', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: 'xyz789',
            commit: {
              message: 'fix: old bug fix',
              author: { name: 'Jane Doe', date: '2022-01-15T00:00:00Z' },
            },
            repository: {
              fullName: 'example/repo',
              url: 'https://github.com/example/repo',
            },
            url: 'https://github.com/example/repo/commit/xyz789',
          },
        ],
        command: 'gh search commits --author-date="<2022-02-01" --json ...',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        'author-date': '<2022-02-01',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['commits', '--author-date=<2022-02-01']),
        { cache: false }
      );

      const data = JSON.parse(result.content[0].text as string);
      expect(data.commits).toHaveLength(1);
      expect(data.commits[0].date).toBe('15/01/2022');
    });

    it('should handle hash-based filter without query', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: '8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3',
            commit: {
              message: 'specific commit',
              author: { name: 'Test User', date: '2023-06-01T00:00:00Z' },
            },
            repository: {
              fullName: 'test/repo',
              url: 'https://github.com/test/repo',
            },
            url: 'https://github.com/test/repo/commit/8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3',
          },
        ],
        command:
          'gh search commits --hash=8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3 --json ...',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        hash: '8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'commits',
          '--hash=8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3',
          '--limit=100',
          '--json=sha,commit,author,committer,repository,url,parents',
        ]),
        { cache: false }
      );
    });

    it('should handle author-name filter without query', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            sha: 'abc999',
            commit: {
              message: 'feature implementation',
              author: { name: 'Jane Doe', date: '2023-07-01T00:00:00Z' },
            },
            repository: {
              fullName: 'company/project',
              url: 'https://github.com/company/project',
            },
            url: 'https://github.com/company/project/commit/abc999',
          },
        ],
        command: 'gh search commits --author-name="Jane Doe" --json ...',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        'author-name': 'Jane Doe',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['commits', '--author-name=Jane Doe']),
        { cache: false }
      );

      const data = JSON.parse(result.content[0].text as string);
      expect(data.commits).toHaveLength(1);
      expect(data.commits[0].author).toBe('Jane Doe');
    });
  });
});
