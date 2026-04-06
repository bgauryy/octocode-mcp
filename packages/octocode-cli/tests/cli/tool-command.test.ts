import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publicMocks = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  initializeProviders: vi.fn().mockResolvedValue([]),
  localSearchCode: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'tool output' }],
  }),
  githubSearchCode: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'github output' }],
  }),
  noop: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'ok' }],
  }),
}));

vi.mock('../../../octocode-mcp/src/public.js', async () => {
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
    executeRipgrepSearch: publicMocks.localSearchCode,
    executeFetchContent: publicMocks.noop,
    executeFindFiles: publicMocks.noop,
    executeViewStructure: publicMocks.noop,
    executeGotoDefinition: publicMocks.noop,
    executeFindReferences: publicMocks.noop,
    executeCallHierarchy: publicMocks.noop,
    fetchMultipleGitHubFileContents: publicMocks.noop,
    searchMultipleGitHubCode: publicMocks.githubSearchCode,
    searchMultipleGitHubPullRequests: publicMocks.noop,
    searchMultipleGitHubRepos: publicMocks.noop,
    exploreMultipleRepositoryStructures: publicMocks.noop,
    searchPackages: publicMocks.noop,
    RipgrepQuerySchema: localBase.extend({
      path: z.string(),
      pattern: z.string(),
      fixedString: z.boolean().optional(),
      include: z.array(z.string()).optional(),
      limit: z.number().optional(),
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
    }),
    GitHubCodeSearchQuerySchema: githubBase.extend({
      keywordsToSearch: z.array(z.string()),
      owner: z.string().optional(),
      repo: z.string().optional(),
      limit: z.number().optional(),
    }),
    GitHubPullRequestSearchQuerySchema: githubBase.extend({
      owner: z.string(),
      repo: z.string(),
    }),
    GitHubReposSearchSingleQuerySchema: githubBase.extend({
      keywordsToSearch: z.array(z.string()),
    }),
    GitHubViewRepoStructureQuerySchema: githubBase.extend({
      owner: z.string(),
      repo: z.string(),
    }),
    PackageSearchQuerySchema: githubBase.extend({
      ecosystem: z.enum(['npm', 'python']),
      name: z.string(),
    }),
  };
});

describe('toolCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it('executes a tool from direct CLI options with smart coercion', async () => {
    const { toolCommand } = await import('../../src/cli/tool-command.js');

    await toolCommand.handler({
      command: 'tool',
      args: ['localSearchCode'],
      options: {
        path: '.',
        pattern: 'runCLI',
        fixedString: true,
        include: 'ts,tsx',
        limit: '5',
      },
    });

    expect(publicMocks.initialize).toHaveBeenCalledTimes(1);
    expect(publicMocks.initializeProviders).toHaveBeenCalledTimes(1);
    expect(publicMocks.localSearchCode).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          path: '.',
          pattern: 'runCLI',
          fixedString: true,
          include: ['ts', 'tsx'],
          limit: 5,
          researchGoal: 'Execute localSearchCode via octocode-cli',
          reasoning: 'Executed via octocode-cli tool command',
        }),
      ],
    });
    expect(consoleSpy).toHaveBeenCalledWith('tool output');
    expect(process.exitCode).toBeUndefined();
  });

  it('accepts JSON input payloads and preserves bulk wrapper fields', async () => {
    const { toolCommand } = await import('../../src/cli/tool-command.js');

    await toolCommand.handler({
      command: 'tool',
      args: ['githubSearchCode'],
      options: {
        input:
          '{"queries":[{"keywordsToSearch":["tool"],"owner":"bgauryy","repo":"octocode-mcp"}],"responseCharLength":1200}',
      },
    });

    expect(publicMocks.githubSearchCode).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          keywordsToSearch: ['tool'],
          owner: 'bgauryy',
          repo: 'octocode-mcp',
          mainResearchGoal: 'Execute githubSearchCode via octocode-cli',
          researchGoal: 'Execute githubSearchCode via octocode-cli',
          reasoning: 'Executed via octocode-cli tool command',
        }),
      ],
      responseCharLength: 1200,
    });
    expect(consoleSpy).toHaveBeenCalledWith('github output');
  });

  it('shows schema help when a tool is selected without input', async () => {
    const { toolCommand } = await import('../../src/cli/tool-command.js');

    await toolCommand.handler({
      command: 'tool',
      args: ['localSearchCode'],
      options: {},
    });

    expect(publicMocks.localSearchCode).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('localSearchCode')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Required')
    );
  });
});
