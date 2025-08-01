import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockSearchGitHubCommitsAPI = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubCommitsAPI: mockSearchGitHubCommitsAPI,
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

    // Default API mock behavior - return error so CLI takes precedence
    mockSearchGitHubCommitsAPI.mockResolvedValue({
      isError: true,
      content: [{ text: JSON.stringify({ error: 'API error' }) }],
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
    mockSearchGitHubCommitsAPI.mockReset();
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
      expect(result.content[0].text as string).toContain('No commits found');
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

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from commit messages', async () => {
      const mockResponseWithTokens = [
        {
          sha: 'abc123def456',
          commit: {
            message:
              'Fix auth with token ghp_1234567890abcdefghijklmnopqrstuvwxyz123456',
            author: {
              name: 'Test User',
              email: 'test@example.com',
              date: '2023-01-01T00:00:00Z',
            },
            committer: {
              name: 'Test User',
              email: 'test@example.com',
              date: '2023-01-01T00:00:00Z',
            },
          },
          author: {
            login: 'testuser',
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/abc123def456',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh search commits "fix auth"',
              result: mockResponseWithTokens,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'fix auth',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits[0].message).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(response.commits[0].message).toContain('[REDACTED-GITHUBTOKENS]');
    });

    it('should sanitize API keys from commit messages', async () => {
      const mockResponseWithApiKeys = [
        {
          sha: 'def456ghi789',
          commit: {
            message:
              'Update config with OpenAI key sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO and AWS key AKIAIOSFODNN7EXAMPLE',
            author: {
              name: 'Dev User',
              email: 'dev@example.com',
              date: '2023-01-02T00:00:00Z',
            },
            committer: {
              name: 'Dev User',
              email: 'dev@example.com',
              date: '2023-01-02T00:00:00Z',
            },
          },
          author: {
            login: 'devuser',
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/def456ghi789',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh search commits "update config"',
              result: mockResponseWithApiKeys,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'update config',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      const commitMessage = response.commits[0].message;
      expect(commitMessage).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(commitMessage).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(commitMessage).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(commitMessage).toContain('[REDACTED-AWSACCESSKEYID]');
    });

    it('should sanitize database connection strings from commits', async () => {
      const mockResponseWithDbCredentials = [
        {
          sha: 'ghi789jkl012',
          commit: {
            message:
              'Update database connection: postgresql://user:password123@localhost:5432/mydb',
            author: {
              name: 'Database Admin',
              email: 'dba@example.com',
              date: '2023-01-03T00:00:00Z',
            },
            committer: {
              name: 'Database Admin',
              email: 'dba@example.com',
              date: '2023-01-03T00:00:00Z',
            },
          },
          author: {
            login: 'dbauser',
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/ghi789jkl012',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh search commits "database connection"',
              result: mockResponseWithDbCredentials,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'database connection',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits[0].message).not.toContain(
        'postgresql://user:password123@localhost:5432/mydb'
      );
      expect(response.commits[0].message).toContain(
        '[REDACTED-POSTGRESQLCONNECTIONSTRING]'
      );
    });

    it('should sanitize sensitive data from commit diffs when getChangesContent is true', async () => {
      const mockCommitSearchResponse = [
        {
          sha: 'abc123',
          commit: {
            message: 'Add configuration',
            author: {
              name: 'Test User',
              email: 'test@example.com',
              date: '2023-01-01T00:00:00Z',
            },
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/abc123',
        },
      ];

      const mockCommitWithDiff = {
        sha: 'abc123',
        commit: {
          message: 'Add configuration',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            date: '2023-01-01T00:00:00Z',
          },
        },
        stats: {
          additions: 3,
          deletions: 0,
          total: 3,
        },
        files: [
          {
            filename: 'config.env',
            status: 'added',
            additions: 3,
            deletions: 0,
            changes: 3,
            patch: `@@ -0,0 +1,3 @@
+GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz123456
+OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO
+DATABASE_URL=mongodb://admin:secret@cluster0.mongodb.net:27017/app`,
          },
        ],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                command: 'gh search commits "configuration"',
                result: mockCommitSearchResponse,
                type: 'github',
              }),
            },
          ],
          isError: false,
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                command: 'gh api /repos/test/repo/commits/abc123',
                result: mockCommitWithDiff,
                type: 'github',
              }),
            },
          ],
          isError: false,
        });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'configuration',
        getChangesContent: true,
        owner: 'test',
        repo: 'repo',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      const commitData = response.commits[0];
      const patchContent = commitData.diff.files[0].patch;

      // Verify secrets are redacted from patch
      expect(patchContent).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(patchContent).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(patchContent).not.toContain(
        'mongodb://admin:secret@cluster0.mongodb.net:27017/app'
      );

      // Verify redacted placeholders are present
      expect(patchContent).toContain('[REDACTED-GITHUBTOKENS]');
      expect(patchContent).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(patchContent).toContain('[REDACTED-MONGODBCONNECTIONSTRING]');
    });

    it('should sanitize private keys from commit content', async () => {
      const mockResponseWithPrivateKey = [
        {
          sha: 'key456def789',
          commit: {
            message: `Add SSH private key: -----BEGIN RSA PRIVATE KEY----- MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ== -----END RSA PRIVATE KEY-----`,
            author: {
              name: 'Security User',
              email: 'security@example.com',
              date: '2023-01-04T00:00:00Z',
            },
            committer: {
              name: 'Security User',
              email: 'security@example.com',
              date: '2023-01-04T00:00:00Z',
            },
          },
          author: {
            login: 'securityuser',
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/key456def789',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh search commits "SSH private key"',
              result: mockResponseWithPrivateKey,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'SSH private key',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits[0].message).not.toContain(
        'MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ'
      );
      expect(response.commits[0].message).toContain('[REDACTED-RSAPRIVATEKEY]');
    });

    it('should preserve clean commit content without secrets', async () => {
      const mockCleanResponse = [
        {
          sha: 'clean123abc456',
          commit: {
            message: 'Add new feature for user authentication',
            author: {
              name: 'Clean User',
              email: 'clean@example.com',
              date: '2023-01-05T00:00:00Z',
            },
            committer: {
              name: 'Clean User',
              email: 'clean@example.com',
              date: '2023-01-05T00:00:00Z',
            },
          },
          author: {
            login: 'cleanuser',
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/clean123abc456',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh search commits "user authentication"',
              result: mockCleanResponse,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'user authentication',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits[0].message).toBe(
        'Add new feature for user authentication'
      );
    });

    it('should sanitize multiple types of sensitive data in single commit', async () => {
      const mockResponseWithMixedSecrets = [
        {
          sha: 'mixed789ghi012',
          commit: {
            message: `Emergency fix - credentials exposed: GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz123456 OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE DATABASE_URL=postgresql://user:pass@localhost:5432/db`,
            author: {
              name: 'Emergency User',
              email: 'emergency@example.com',
              date: '2023-01-06T00:00:00Z',
            },
            committer: {
              name: 'Emergency User',
              email: 'emergency@example.com',
              date: '2023-01-06T00:00:00Z',
            },
          },
          author: {
            login: 'emergencyuser',
          },
          repository: {
            fullName: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/commit/mixed789ghi012',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh search commits "emergency fix"',
              result: mockResponseWithMixedSecrets,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      registerGitHubSearchCommitsTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'emergency fix',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      const commitMessage = response.commits[0].message;

      // Verify all secrets are redacted
      expect(commitMessage).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(commitMessage).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(commitMessage).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(commitMessage).not.toContain(
        'postgresql://user:pass@localhost:5432/db'
      );

      // Verify redacted placeholders are present
      expect(commitMessage).toContain('[REDACTED-GITHUBTOKENS]');
      expect(commitMessage).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(commitMessage).toContain('[REDACTED-AWSACCESSKEYID]');
      expect(commitMessage).toContain('[REDACTED-POSTGRESQLCONNECTIONSTRING]');

      // Verify non-sensitive content is preserved
      expect(commitMessage).toContain('Emergency fix - credentials exposed:');
      expect(commitMessage).toContain('GITHUB_TOKEN=');
      expect(commitMessage).toContain('OPENAI_API_KEY=');
    });
  });
});
