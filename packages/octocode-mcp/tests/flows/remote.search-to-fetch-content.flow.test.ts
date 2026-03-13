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
  getServerConfig: vi.fn(() => ({
    toolsToRun: ['githubSearchCode', 'githubGetFileContent'],
    enableTools: [],
    disableTools: [],
  })),
  getActiveProviderConfig: vi.fn(() => ({
    provider: 'gitlab',
    baseUrl: 'https://gitlab.example.com',
    token: 'provider-token',
  })),
  getActiveProvider: vi.fn(() => 'gitlab'),
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
    isToolInMetadata: vi.fn().mockReturnValue(true),
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

  beforeEach(async () => {
    vi.clearAllMocks();
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

    const result = await registerTools(mockServer.server);
    expect(result.successCount).toBe(2);
    expect(result.failedTools).toEqual([]);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  it('chains registered remote tools through provider selection and file handoff', async () => {
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
            url: 'https://gitlab.example.com/group/project/-/blob/main/src/score.ts',
            repository: {
              id: '42',
              name: 'group/project',
              url: 'https://gitlab.example.com/group/project',
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
          owner: 'group',
          repo: 'project',
          branch: 'main',
        },
      },
      status: 200,
      provider: 'gitlab',
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
      provider: 'gitlab',
    });

    const searchResponse = await mockServer.callTool('githubSearchCode', {
      queries: [
        {
          id: 'remote_search_score',
          owner: 'group',
          repo: 'project',
          keywordsToSearch: ['computeScore'],
          path: 'src',
          match: 'file',
          researchGoal:
            'Find the computeScore implementation in the active provider',
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
    expect(matchedFile?.owner).toBe('group');
    expect(matchedFile?.repo).toBe('project');
    expect(mockGetProvider).toHaveBeenCalledWith(
      'gitlab',
      expect.objectContaining({
        type: 'gitlab',
        baseUrl: 'https://gitlab.example.com',
        token: 'provider-token',
      })
    );

    const fetchResponse = await mockServer.callTool('githubGetFileContent', {
      queries: [
        {
          id: 'remote_fetch_score',
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
  });
});
