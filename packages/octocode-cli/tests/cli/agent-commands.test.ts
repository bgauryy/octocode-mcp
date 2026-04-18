import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publicMocks = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  initializeProviders: vi.fn().mockResolvedValue([]),
  loadToolContent: vi.fn().mockResolvedValue({
    instructions: 'Use Octocode tools carefully.',
    prompts: {},
    toolNames: {},
    baseSchema: {
      mainResearchGoal: 'main goal',
      researchGoal: 'goal',
      reasoning: 'reasoning',
      bulkQuery: (toolName: string) => `queries for ${toolName}`,
    },
    tools: {},
    baseHints: { hasResults: [], empty: [] },
    genericErrorHints: [],
  }),
  searchMultipleGitHubCode: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'github code output' }],
  }),
  fetchMultipleGitHubFileContents: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'file content' }],
  }),
  exploreMultipleRepositoryStructures: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'tree' }],
  }),
  searchMultipleGitHubRepos: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'repos' }],
  }),
  searchMultipleGitHubPullRequests: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'prs' }],
  }),
  searchPackages: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'pkg' }],
  }),
  noop: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'ok' }],
  }),
}));

vi.mock('octocode-mcp/public', async () => {
  const { z } = await import('zod/v4');

  const localBase = z.object({
    id: z.string(),
    researchGoal: z.string(),
    reasoning: z.string(),
  });

  const githubBase = z.object({
    id: z.string(),
    mainResearchGoal: z.string(),
    researchGoal: z.string(),
    reasoning: z.string(),
  });

  return {
    initialize: publicMocks.initialize,
    initializeProviders: publicMocks.initializeProviders,
    loadToolContent: publicMocks.loadToolContent,
    executeRipgrepSearch: publicMocks.noop,
    executeFetchContent: publicMocks.noop,
    executeFindFiles: publicMocks.noop,
    executeViewStructure: publicMocks.noop,
    executeGotoDefinition: publicMocks.noop,
    executeFindReferences: publicMocks.noop,
    executeCallHierarchy: publicMocks.noop,
    fetchMultipleGitHubFileContents:
      publicMocks.fetchMultipleGitHubFileContents,
    searchMultipleGitHubCode: publicMocks.searchMultipleGitHubCode,
    searchMultipleGitHubPullRequests:
      publicMocks.searchMultipleGitHubPullRequests,
    searchMultipleGitHubRepos: publicMocks.searchMultipleGitHubRepos,
    exploreMultipleRepositoryStructures:
      publicMocks.exploreMultipleRepositoryStructures,
    searchPackages: publicMocks.searchPackages,
    RipgrepQuerySchema: localBase.extend({
      path: z.string(),
      pattern: z.string(),
    }),
    FetchContentQuerySchema: localBase.extend({
      path: z.string(),
    }),
    FindFilesQuerySchema: localBase.extend({
      path: z.string(),
    }),
    ViewStructureQuerySchema: localBase.extend({
      path: z.string(),
    }),
    LSPGotoDefinitionQuerySchema: localBase.extend({
      path: z.string(),
    }),
    LSPFindReferencesQuerySchema: localBase.extend({
      path: z.string(),
    }),
    LSPCallHierarchyQuerySchema: localBase.extend({
      path: z.string(),
    }),
    FileContentQuerySchema: githubBase.extend({
      owner: z.string(),
      repo: z.string(),
      path: z.string(),
      branch: z.string().optional(),
      matchString: z.string().optional(),
      matchContextLines: z.number().optional(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
      fullContent: z.boolean().optional(),
    }),
    GitHubCodeSearchQuerySchema: githubBase.extend({
      keywordsToSearch: z.array(z.string()),
      owner: z.string().optional(),
      repo: z.string().optional(),
      path: z.string().optional(),
      filename: z.string().optional(),
      extension: z.string().optional(),
      match: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
    }),
    GitHubPullRequestSearchQuerySchema: githubBase.extend({
      query: z.string().optional(),
      owner: z.string().optional(),
      repo: z.string().optional(),
      state: z.string().optional(),
      author: z.string().optional(),
      merged: z.boolean().optional(),
      draft: z.boolean().optional(),
      withComments: z.boolean().optional(),
      withCommits: z.boolean().optional(),
      limit: z.number().optional(),
    }),
    GitHubReposSearchSingleQuerySchema: githubBase.extend({
      keywordsToSearch: z.array(z.string()).optional(),
      topicsToSearch: z.array(z.string()).optional(),
      owner: z.string().optional(),
      stars: z.string().optional(),
      sort: z.string().optional(),
      limit: z.number().optional(),
    }),
    GitHubViewRepoStructureQuerySchema: githubBase.extend({
      owner: z.string(),
      repo: z.string(),
      branch: z.string().optional(),
      path: z.string().optional(),
      depth: z.number().optional(),
    }),
    PackageSearchQuerySchema: githubBase.extend({
      ecosystem: z.enum(['npm', 'python']),
      name: z.string(),
      searchLimit: z.number().optional(),
      npmFetchMetadata: z.boolean().optional(),
      pythonFetchMetadata: z.boolean().optional(),
    }),
  };
});

describe('agent subcommands', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: typeof process.exitCode;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.exitCode = originalExitCode;
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
  });

  async function runAgent(
    name: string,
    options: Record<string, string | boolean>
  ) {
    const { agentCommands } = await import('../../src/cli/agent-commands.js');
    const cmd = agentCommands.find(c => c.name === name);
    if (!cmd) throw new Error(`agent subcommand not found: ${name}`);
    await cmd.handler!({ command: name, args: [], options });
  }

  it('search-code: maps --query to keywordsToSearch array and autofills goals', async () => {
    await runAgent('search-code', {
      query: 'useReducer, dispatch',
      owner: 'facebook',
      repo: 'react',
      limit: '5',
    });

    expect(publicMocks.searchMultipleGitHubCode).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          keywordsToSearch: ['useReducer', 'dispatch'],
          owner: 'facebook',
          repo: 'react',
          limit: 5,
          mainResearchGoal: 'Execute githubSearchCode via octocode-cli',
          researchGoal: 'Execute githubSearchCode via octocode-cli',
          reasoning: 'Executed via octocode-cli tool command',
        }),
      ],
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('search-code: rejects non-numeric --limit with exit 1', async () => {
    await runAgent('search-code', {
      query: 'foo',
      limit: 'abc',
    });

    expect(publicMocks.searchMultipleGitHubCode).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('get-file: fails with exit 1 when required flags missing', async () => {
    await runAgent('get-file', { owner: 'facebook' });

    expect(publicMocks.fetchMultipleGitHubFileContents).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('get-file: passes full-content boolean and matchString kebab→camel', async () => {
    await runAgent('get-file', {
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/src/React.js',
      'match-string': 'useState',
      'full-content': true,
    });

    expect(publicMocks.fetchMultipleGitHubFileContents).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          owner: 'facebook',
          repo: 'react',
          path: 'packages/react/src/React.js',
          matchString: 'useState',
          fullContent: true,
        }),
      ],
    });
  });

  it('view-structure: passes numeric depth and branch', async () => {
    await runAgent('view-structure', {
      owner: 'bgauryy',
      repo: 'octocode-mcp',
      branch: 'main',
      depth: '2',
    });

    expect(
      publicMocks.exploreMultipleRepositoryStructures
    ).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          owner: 'bgauryy',
          repo: 'octocode-mcp',
          branch: 'main',
          depth: 2,
        }),
      ],
    });
  });

  it('search-repos: splits comma-separated topics into array', async () => {
    await runAgent('search-repos', {
      topics: 'typescript, mcp',
      stars: '>=100',
    });

    expect(publicMocks.searchMultipleGitHubRepos).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          topicsToSearch: ['typescript', 'mcp'],
          stars: '>=100',
        }),
      ],
    });
  });

  it('search-prs: passes merged/draft booleans and owner', async () => {
    await runAgent('search-prs', {
      owner: 'facebook',
      repo: 'react',
      merged: true,
      draft: true,
    });

    expect(publicMocks.searchMultipleGitHubPullRequests).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          owner: 'facebook',
          repo: 'react',
          merged: true,
          draft: true,
        }),
      ],
    });
  });

  it('package-search: passes ecosystem and name and npm-fetch-metadata boolean', async () => {
    await runAgent('package-search', {
      name: 'react',
      ecosystem: 'npm',
      'npm-fetch-metadata': true,
    });

    expect(publicMocks.searchPackages).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          name: 'react',
          ecosystem: 'npm',
          npmFetchMetadata: true,
        }),
      ],
    });
  });

  it('package-search: exit 1 on missing required --name', async () => {
    await runAgent('package-search', { ecosystem: 'npm' });

    expect(publicMocks.searchPackages).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('--json: prints compact structuredContent only, dropping text block', async () => {
    publicMocks.searchMultipleGitHubCode.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'human-readable yaml output' }],
      structuredContent: {
        results: [{ id: 'q1', status: 'hasResults', data: { hits: 42 } }],
      },
    });

    await runAgent('search-code', {
      query: 'foo',
      json: true,
    });

    const printedJsonCall = consoleLogSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && (call[0] as string).startsWith('{')
    );
    expect(printedJsonCall).toBeDefined();
    const printed = printedJsonCall?.[0] as string;
    expect(printed).toContain('"results"');
    expect(printed).toContain('"hits":42');
    expect(printed).not.toContain('human-readable yaml output');
    expect(printed).not.toContain('\n  ');
  });

  it('sets exit code 1 when tool result reports isError', async () => {
    publicMocks.searchMultipleGitHubCode.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'oops' }],
      isError: true,
    });

    await runAgent('search-code', { query: 'foo' });

    expect(process.exitCode).toBe(1);
  });
});
