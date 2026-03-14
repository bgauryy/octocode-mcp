import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GitHubFetchContentDataSchema,
  GitHubFetchContentOutputSchema,
  GitHubSearchCodeDataSchema,
  GitHubSearchCodeOutputSchema,
} from '../../src/scheme/outputSchemas.js';
import { registerTools } from '../../src/tools/toolsManager.js';
import {
  createMockMcpServer,
  type MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { expectHasResultsData } from './assertions.js';
import { FLOW_CATALOG } from './catalog.js';

const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsToolInMetadata = vi.hoisted(() => vi.fn());
const mockGetActiveProvider = vi.hoisted(() => vi.fn());
const mockGetActiveProviderConfig = vi.hoisted(() => vi.fn());
const mockLogSessionError = vi.hoisted(() => vi.fn());
const mockLogToolCall = vi.hoisted(() => vi.fn());

vi.mock('../../src/providers/factory.js', () => ({
  getProvider: mockGetProvider,
}));

vi.mock('../../src/session.js', () => ({
  logSessionError: mockLogSessionError,
  logToolCall: mockLogToolCall,
}));

vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: mockGetServerConfig,
  getActiveProviderConfig: mockGetActiveProviderConfig,
  getActiveProvider: mockGetActiveProvider,
  isLocalEnabled: vi.fn(() => false),
  isCloneEnabled: vi.fn(() => false),
  isLoggingEnabled: vi.fn(() => false),
}));

vi.mock('../../src/tools/toolMetadata/index.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/tools/toolMetadata/index.js')
  >('../../src/tools/toolMetadata/index.js');

  return {
    ...actual,
    isToolInMetadata: mockIsToolInMetadata,
    TOOL_NAMES: actual.STATIC_TOOL_NAMES,
    DESCRIPTIONS: new Proxy(
      {},
      {
        get: () => 'Flow test description',
      }
    ),
  };
});

describe(FLOW_CATALOG.remoteSearchToFetchContent.id, () => {
  const providerFlows = [
    {
      provider: 'github' as const,
      baseUrl: undefined as string | undefined,
      token: 'github-token',
      owner: 'octocat',
      repo: 'octokit',
      urlPrefix: 'https://github.com',
    },
    {
      provider: 'gitlab' as const,
      baseUrl: 'https://gitlab.example.com',
      token: 'gitlab-token',
      owner: 'group',
      repo: 'project',
      urlPrefix: 'https://gitlab.example.com',
    },
    {
      provider: 'bitbucket' as const,
      baseUrl: 'https://api.bitbucket.org',
      token: 'bitbucket-token',
      owner: 'workspace',
      repo: 'repo',
      urlPrefix: 'https://bitbucket.org',
    },
  ];

  let mockServer: MockMcpServer;
  let mockProvider: {
    capabilities: {
      cloneRepo: boolean;
      fetchDirectoryToDisk: boolean;
      requiresScopedCodeSearch: boolean;
      supportsMergedState: boolean;
      supportsMultiTopicSearch: boolean;
    };
    searchCode: ReturnType<typeof vi.fn>;
    getFileContent: ReturnType<typeof vi.fn>;
    searchRepos: ReturnType<typeof vi.fn>;
    searchPullRequests: ReturnType<typeof vi.fn>;
    getRepoStructure: ReturnType<typeof vi.fn>;
    resolveDefaultBranch: ReturnType<typeof vi.fn>;
  };

  function setupActiveProvider(provider: (typeof providerFlows)[number]) {
    mockGetActiveProvider.mockReturnValue(provider.provider);
    mockGetActiveProviderConfig.mockReturnValue({
      provider: provider.provider,
      baseUrl: provider.baseUrl,
      token: provider.token,
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetServerConfig.mockReturnValue({
      toolsToRun: ['githubSearchCode', 'githubGetFileContent'],
      enableTools: [],
      disableTools: [],
    });
    mockIsToolInMetadata.mockReturnValue(true);
    mockServer = createMockMcpServer();
    mockProvider = {
      capabilities: {
        cloneRepo: false,
        fetchDirectoryToDisk: false,
        requiresScopedCodeSearch: false,
        supportsMergedState: true,
        supportsMultiTopicSearch: true,
      },
      searchCode: vi.fn(),
      getFileContent: vi.fn(),
      searchRepos: vi.fn(),
      searchPullRequests: vi.fn(),
      getRepoStructure: vi.fn(),
      resolveDefaultBranch: vi.fn().mockResolvedValue('main'),
    };
    mockGetProvider.mockReturnValue(mockProvider);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  it.each(providerFlows)(
    'chains remote search->fetch for %s provider',
    async providerCase => {
      setupActiveProvider(providerCase);
      const result = await registerTools(mockServer.server);
      expect(result.successCount).toBe(2);
      expect(result.failedTools).toEqual([]);

      mockProvider.searchCode.mockResolvedValue({
        data: {
          items: [
            {
              path: 'src/score.ts',
              matches: [
                {
                  context:
                    'export function computeScore(input: ScoreInput): number {',
                  positions: [[16, 28]],
                },
              ],
              url: `${providerCase.urlPrefix}/${providerCase.owner}/${providerCase.repo}/-/blob/main/src/score.ts`,
              repository: {
                id: '42',
                name: `${providerCase.owner}/${providerCase.repo}`,
                url: `${providerCase.urlPrefix}/${providerCase.owner}/${providerCase.repo}`,
              },
              lastModifiedAt: '2026-03-13T10:00:00.000Z',
            },
          ],
          totalCount: 1,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            hasMore: false,
            entriesPerPage: 10,
            totalMatches: 1,
          },
          repositoryContext: {
            owner: providerCase.owner,
            repo: providerCase.repo,
            branch: 'main',
          },
        },
        status: 200,
        provider: providerCase.provider,
      });

      mockProvider.getFileContent.mockResolvedValue({
        data: {
          path: 'src/score.ts',
          content:
            'export function computeScore(input: ScoreInput): number {\n  return input.value + input.bonus;\n}\n',
          encoding: 'utf-8',
          size: 96,
          ref: 'main',
          lastModified: '2026-03-13T10:00:00.000Z',
        },
        status: 200,
        provider: providerCase.provider,
      });

      const searchResponse = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            id: `remote_search_score_${providerCase.provider}`,
            owner: providerCase.owner,
            repo: providerCase.repo,
            keywordsToSearch: ['computeScore'],
            path: 'src',
            match: 'file',
            researchGoal: `Find the computeScore implementation in ${providerCase.provider}`,
            reasoning: 'Need a remote file path before fetching content',
          },
        ],
      });

      const searchData = expectHasResultsData(
        GitHubSearchCodeOutputSchema,
        GitHubSearchCodeDataSchema,
        searchResponse
      );
      const matchedFile = searchData.files?.[0];

      expect(matchedFile).toBeDefined();
      expect(matchedFile?.path).toBe('src/score.ts');
      expect(matchedFile?.owner).toBe(providerCase.owner);
      expect(matchedFile?.repo).toBe(providerCase.repo);
      expect(mockGetProvider).toHaveBeenCalledWith(
        providerCase.provider,
        expect.objectContaining({
          type: providerCase.provider,
          baseUrl: providerCase.baseUrl,
          token: providerCase.token,
        })
      );
      expect(mockProvider.searchCode).toHaveBeenCalledWith(
        expect.objectContaining({
          keywords: ['computeScore'],
          projectId: `${providerCase.owner}/${providerCase.repo}`,
          path: 'src',
        })
      );

      const fetchResponse = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            id: `remote_fetch_score_${providerCase.provider}`,
            owner: matchedFile!.owner,
            repo: matchedFile!.repo,
            path: matchedFile!.path,
            branch: searchData.repositoryContext?.branch,
            matchString: 'export function computeScore',
            researchGoal: 'Read the matched remote file',
            reasoning: 'Use the path handoff from remote code search',
          },
        ],
      });

      const fetchData = expectHasResultsData(
        GitHubFetchContentOutputSchema,
        GitHubFetchContentDataSchema,
        fetchResponse
      );

      expect(fetchData.content).toContain('computeScore');
      expect(fetchData.lastModified).toBe('2026-03-13T10:00:00.000Z');
      expect(mockProvider.getFileContent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: `${providerCase.owner}/${providerCase.repo}`,
          path: 'src/score.ts',
          ref: searchData.repositoryContext?.branch,
        })
      );
    }
  );
});
