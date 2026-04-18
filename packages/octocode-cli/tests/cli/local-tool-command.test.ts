import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publicMocks = vi.hoisted(() => ({
  executeRipgrepSearch: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'search results' }],
  }),
  executeFetchContent: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'file content output' }],
  }),
  executeFindFiles: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'found files' }],
  }),
  executeViewStructure: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'tree output' }],
  }),
}));

vi.mock('octocode-mcp/public', async () => {
  const { z } = await import('zod/v4');

  const localBase = z.object({
    id: z.string(),
    researchGoal: z.string(),
    reasoning: z.string(),
  });

  return {
    executeRipgrepSearch: publicMocks.executeRipgrepSearch,
    executeFetchContent: publicMocks.executeFetchContent,
    executeFindFiles: publicMocks.executeFindFiles,
    executeViewStructure: publicMocks.executeViewStructure,
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
  };
});

describe('executeLocalToolCommand', () => {
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

  async function runLocal(
    toolName: string,
    jsonInput: string,
    options: Record<string, string | boolean> = {}
  ) {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    return executeLocalToolCommand({
      command: 'tool',
      args: [toolName, jsonInput],
      options: { tool: toolName, ...options },
    });
  }

  it('executes localSearchCode with valid input and autofills goals', async () => {
    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"runCLI"}'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeRipgrepSearch).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          path: '.',
          pattern: 'runCLI',
          id: 'localSearchCode-1',
          researchGoal: 'Execute localSearchCode via octocode-cli',
          reasoning: 'Executed via octocode-cli tool command',
        }),
      ],
    });
    expect(consoleSpy).toHaveBeenCalledWith('search results');
  });

  it('executes localGetFileContent', async () => {
    const success = await runLocal(
      'localGetFileContent',
      '{"path":"src/index.ts"}'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeFetchContent).toHaveBeenCalledWith({
      queries: [expect.objectContaining({ path: 'src/index.ts' })],
    });
    expect(consoleSpy).toHaveBeenCalledWith('file content output');
  });

  it('executes localFindFiles', async () => {
    const success = await runLocal('localFindFiles', '{"path":"src/cli"}');

    expect(success).toBe(true);
    expect(publicMocks.executeFindFiles).toHaveBeenCalledWith({
      queries: [expect.objectContaining({ path: 'src/cli' })],
    });
  });

  it('executes localViewStructure', async () => {
    const success = await runLocal('localViewStructure', '{"path":"src/cli"}');

    expect(success).toBe(true);
    expect(publicMocks.executeViewStructure).toHaveBeenCalledWith({
      queries: [expect.objectContaining({ path: 'src/cli' })],
    });
  });

  it('returns false for unknown tool names', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: [
        'githubSearchCode',
        '{"owner":"x","repo":"y","keywordsToSearch":["a"]}',
      ],
      options: { tool: 'githubSearchCode' },
    });

    expect(success).toBe(false);
  });

  it('returns false when no tool name is provided', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: [],
      options: {},
    });

    expect(success).toBe(false);
  });

  it('returns false when no JSON input is provided', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: ['localSearchCode'],
      options: { tool: 'localSearchCode' },
    });

    expect(success).toBe(false);
  });

  it('prints error for invalid JSON input', async () => {
    const success = await runLocal('localSearchCode', '{bad json');

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Tool input must be valid JSON')
    );
  });

  it('prints error for schema validation failure', async () => {
    const success = await runLocal('localSearchCode', '{"path":"."}');

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not match the expected schema')
    );
  });

  it('accepts bulk queries format', async () => {
    const success = await runLocal(
      'localSearchCode',
      '{"queries":[{"path":".","pattern":"foo"},{"path":".","pattern":"bar"}]}'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeRipgrepSearch).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({ path: '.', pattern: 'foo' }),
        expect.objectContaining({ path: '.', pattern: 'bar' }),
      ],
    });
  });

  it('passes responseCharLength and responseCharOffset from bulk payload', async () => {
    const success = await runLocal(
      'localSearchCode',
      '{"queries":[{"path":".","pattern":"foo"}],"responseCharLength":500,"responseCharOffset":100}'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeRipgrepSearch).toHaveBeenCalledWith({
      queries: [expect.objectContaining({ path: '.', pattern: 'foo' })],
      responseCharLength: 500,
      responseCharOffset: 100,
    });
  });

  it('accepts array-style input', async () => {
    const success = await runLocal(
      'localSearchCode',
      '[{"path":".","pattern":"test1"},{"path":".","pattern":"test2"}]'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeRipgrepSearch).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({ pattern: 'test1' }),
        expect.objectContaining({ pattern: 'test2' }),
      ],
    });
  });

  it('outputs JSON when --json flag is set', async () => {
    publicMocks.executeRipgrepSearch.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'human text' }],
      structuredContent: { matches: [{ file: 'a.ts', line: 1 }] },
    });

    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"x"}',
      {
        json: true,
      }
    );

    expect(success).toBe(true);
    const jsonCall = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('matches')
    );
    expect(jsonCall).toBeDefined();
    expect(jsonCall![0]).not.toContain('human text');
  });

  it('outputs JSON when --output json is set', async () => {
    publicMocks.executeRipgrepSearch.mockResolvedValueOnce({
      structuredContent: { data: 'result' },
    });

    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"x"}',
      {
        output: 'json',
      }
    );

    expect(success).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"data"'));
  });

  it('returns false when tool result has isError', async () => {
    publicMocks.executeRipgrepSearch.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'error message' }],
      isError: true,
    });

    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"x"}'
    );

    expect(success).toBe(false);
  });

  it('handles tool execution exceptions gracefully', async () => {
    publicMocks.executeRipgrepSearch.mockRejectedValueOnce(
      new Error('disk failure')
    );

    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"x"}'
    );

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('disk failure')
    );
  });

  it('rejects non-object input', async () => {
    const success = await runLocal('localSearchCode', '"just a string"');

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('JSON object')
    );
  });

  it('rejects empty queries array', async () => {
    const success = await runLocal('localSearchCode', '{"queries":[]}');

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('At least one query')
    );
  });

  it('rejects legacy --input flag', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: ['localSearchCode'],
      options: { tool: 'localSearchCode', input: '{"path":"."}' },
    });

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Legacy --input is not supported')
    );
  });

  it('rejects unexpected tool flags', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: ['localSearchCode'],
      options: { tool: 'localSearchCode', path: '.', pattern: 'foo' },
    });

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported tool flags')
    );
  });

  it('rejects more than 2 positional args', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: ['localSearchCode', '{"path":".","pattern":"x"}', 'extra'],
      options: { tool: 'localSearchCode' },
    });

    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('one quoted JSON string')
    );
  });

  it('normalizes kebab-case and snake_case keys to camelCase', async () => {
    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"x","research_goal":"custom","research-goal":"custom2"}'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeRipgrepSearch).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          path: '.',
          pattern: 'x',
          researchGoal: 'custom2',
        }),
      ],
    });
  });

  it('preserves user-provided id and researchGoal', async () => {
    const success = await runLocal(
      'localSearchCode',
      '{"path":".","pattern":"x","id":"my-id","researchGoal":"my goal","reasoning":"my reason"}'
    );

    expect(success).toBe(true);
    expect(publicMocks.executeRipgrepSearch).toHaveBeenCalledWith({
      queries: [
        expect.objectContaining({
          id: 'my-id',
          researchGoal: 'my goal',
          reasoning: 'my reason',
        }),
      ],
    });
  });

  it('falls back to structuredContent JSON when no text blocks', async () => {
    publicMocks.executeFetchContent.mockResolvedValueOnce({
      structuredContent: { lines: ['a', 'b'] },
    });

    const success = await runLocal('localGetFileContent', '{"path":"x.ts"}');

    expect(success).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"lines"'));
  });

  it('falls back to full result JSON when no content or structuredContent', async () => {
    publicMocks.executeFetchContent.mockResolvedValueOnce({
      someField: 'value',
    });

    const success = await runLocal('localGetFileContent', '{"path":"x.ts"}');

    expect(success).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"someField"')
    );
  });

  it('reads tool name from options.tool when not in args', async () => {
    const { executeLocalToolCommand } =
      await import('../../src/cli/local-tool-command.js');
    const success = await executeLocalToolCommand({
      command: 'tool',
      args: ['localSearchCode', '{"path":".","pattern":"x"}'],
      options: {},
    });

    expect(success).toBe(true);
  });
});
