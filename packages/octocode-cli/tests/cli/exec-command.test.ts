import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const publicMocks = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  initializeProviders: vi.fn().mockResolvedValue([]),
  loadToolContent: vi.fn().mockResolvedValue({
    instructions: '',
    prompts: {},
    toolNames: {},
    baseSchema: {},
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
    }),
    GitHubCodeSearchQuerySchema: githubBase.extend({
      keywordsToSearch: z.array(z.string()),
      owner: z.string().optional(),
      repo: z.string().optional(),
    }),
    GitHubPullRequestSearchQuerySchema: githubBase.extend({
      owner: z.string().optional(),
      repo: z.string().optional(),
    }),
    GitHubReposSearchSingleQuerySchema: githubBase.extend({
      keywordsToSearch: z.array(z.string()).optional(),
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

describe('exec command / oct namespace', () => {
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

  async function runExec(
    options: Record<string, string | boolean>,
    positional: string[] = []
  ) {
    const { execCommand } = await import('../../src/cli/exec-command.js');
    await execCommand.handler({ command: 'exec', args: positional, options });
  }

  it('runs an inline script that calls oct.searchCode', async () => {
    await runExec({}, [
      'const r = await oct.searchCode({ owner: "facebook", repo: "react", keywordsToSearch: ["useState"] }); return r.content[0].text;',
    ]);

    expect(publicMocks.searchMultipleGitHubCode).toHaveBeenCalledTimes(1);
    expect(publicMocks.searchMultipleGitHubCode).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          owner: 'facebook',
          repo: 'react',
          keywordsToSearch: ['useState'],
          mainResearchGoal: 'Execute githubSearchCode via octocode-cli',
          researchGoal: 'Execute githubSearchCode via octocode-cli',
          reasoning: 'Executed via octocode-cli tool command',
        }),
      ],
    });

    const printedReturn = consoleLogSpy.mock.calls.find(
      (call: unknown[]) => call[0] === 'github code output'
    );
    expect(printedReturn).toBeDefined();
    expect(process.exitCode).toBeUndefined();
  });

  it('captures console.log output from user scripts', async () => {
    await runExec({}, ['console.log("hello", "world"); return "done";']);

    const printed = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(printed).toContain('hello world');
    expect(printed).toContain('done');
  });

  it('--json prints { returnValue, logs }', async () => {
    await runExec({ json: true }, [
      'console.log("hi"); return { answer: 42 };',
    ]);

    const jsonCall = consoleLogSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('"returnValue"')
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall?.[0] as string);
    expect(parsed.returnValue).toEqual({ answer: 42 });
    expect(parsed.logs).toEqual(['hi']);
  });

  it('runs Promise.all across multiple oct calls', async () => {
    await runExec({}, [
      'const results = await Promise.all([' +
        'oct.searchCode({ owner: "a", repo: "b", keywordsToSearch: ["x"] }),' +
        'oct.getFile({ owner: "a", repo: "b", path: "README.md" }),' +
        ']); return results.length;',
    ]);

    expect(publicMocks.searchMultipleGitHubCode).toHaveBeenCalledTimes(1);
    expect(publicMocks.fetchMultipleGitHubFileContents).toHaveBeenCalledTimes(
      1
    );
    const printed = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(printed).toContain('2');
  });

  it('blocks access to require inside the sandbox', async () => {
    await runExec({}, ['return typeof require;']);

    const printed = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(printed).toContain('undefined');
    expect(process.exitCode).toBeUndefined();
  });

  it('blocks access to process inside the sandbox', async () => {
    await runExec({}, ['return typeof process;']);

    const printed = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(printed).toContain('undefined');
  });

  it('exits with code 1 on script syntax error', async () => {
    await runExec({}, ['const x = ;']);

    expect(process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('exits with code 1 on runtime error thrown by user script', async () => {
    await runExec({}, ['throw new Error("boom");']);

    expect(process.exitCode).toBe(1);
  });

  it('exits with code 1 and surfaces zod validation error from oct.*', async () => {
    await runExec({}, [
      'await oct.searchCode({ owner: "x", repo: "y" });', // missing keywordsToSearch
    ]);

    expect(process.exitCode).toBe(1);
    expect(publicMocks.searchMultipleGitHubCode).not.toHaveBeenCalled();
  });

  it('--timeout enforces a deadline', async () => {
    await runExec({ timeout: '50' }, [
      'await new Promise(r => setTimeout(r, 500)); return "late";',
    ]);

    expect(process.exitCode).toBe(1);
  });

  it('reads script from --file', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'octocode-exec-'));
    try {
      const scriptPath = path.join(tmp, 'script.js');
      writeFileSync(scriptPath, 'return await oct.tools();', 'utf8');
      await runExec({ file: scriptPath });

      const printed = consoleLogSpy.mock.calls.map(
        (call: unknown[]) => call[0]
      );
      const joined = printed.join('\n');
      expect(joined).toContain('githubSearchCode');
      expect(joined).toContain('packageSearch');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('exits with code 1 when no script is provided', async () => {
    await runExec({}, []);

    expect(process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('exits with code 1 when --file points at a missing file', async () => {
    await runExec({ file: '/definitely/does/not/exist.js' });

    expect(process.exitCode).toBe(1);
  });

  it('exits with code 1 on invalid --timeout value', async () => {
    await runExec({ timeout: 'abc' }, ['return 1;']);

    expect(process.exitCode).toBe(1);
  });

  it('oct.tool(name, input) routes to the right executor', async () => {
    await runExec({}, [
      'const r = await oct.tool("packageSearch", { name: "react", ecosystem: "npm" }); return r.content[0].text;',
    ]);

    expect(publicMocks.searchPackages).toHaveBeenCalledWith({
      queries: [expect.objectContaining({ name: 'react', ecosystem: 'npm' })],
    });
  });
});
