import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccuracyScorer } from './scorers/accuracy.js';
import { ToolSelectionScorer } from './scorers/tool-selection.js';
import { ReasoningScorer } from './scorers/reasoning.js';
import type {
  EvalScorer,
  EvalTestCase,
  ToolResponse,
} from './scorers/types.js';
import { generateReport, runSingleEval } from './utils/eval-runner.js';

const { queryMock, mcpServerStatusMock, spawnMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  mcpServerStatusMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

const EVAL_WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

function createAsyncStream(messages: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        yield message;
      }
    },
    mcpServerStatus: mcpServerStatusMock,
  };
}

function createMockSpawn(lines: string[]) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  queueMicrotask(() => {
    for (const line of lines) {
      stdout.write(`${line}\n`);
    }
    stdout.end();
    stderr.end();
    for (const handler of listeners.get('close') ?? []) {
      handler(0);
    }
  });

  return {
    stdout,
    stderr,
    kill: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      existing.push(handler);
      listeners.set(event, existing);
      return this;
    },
  };
}

describe('Eval regressions', () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalCliOverride = process.env.OCTOCODE_EVAL_USE_CLAUDE_CLI;

  beforeEach(() => {
    vi.resetModules();
    queryMock.mockReset();
    mcpServerStatusMock.mockReset();
    spawnMock.mockReset();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OCTOCODE_EVAL_USE_CLAUDE_CLI;
  });

  afterEach(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalCliOverride === undefined) {
      delete process.env.OCTOCODE_EVAL_USE_CLAUDE_CLI;
    } else {
      process.env.OCTOCODE_EVAL_USE_CLAUDE_CLI = originalCliOverride;
    }
  });

  it('keeps the declared test category in reports instead of inferring from names', async () => {
    const scorer: EvalScorer = {
      name: 'accuracy',
      weight: 1,
      score: async () => 1,
      explain: async () => 'ok',
    };

    const response: ToolResponse = {
      status: 'hasResults',
      resultCount: 1,
      content: 'Found the expected implementation details.',
    };

    const codeSearchCase: EvalTestCase = {
      name: 'react19_use_hook_implementation',
      prompt: 'Inspect the use hook implementation.',
      category: 'code_search',
      expected: { status: 'hasResults' },
    };

    const symbolLookupCase: EvalTestCase = {
      name: 'workspace_entrypoint_locator',
      prompt: 'Locate the package entrypoint.',
      category: 'symbol_lookup',
      expected: { status: 'hasResults' },
    };

    const results = await Promise.all([
      runSingleEval(codeSearchCase, [response], [], [scorer], 0, 10),
      runSingleEval(symbolLookupCase, [response], [], [scorer], 10, 20),
    ]);

    const report = generateReport(
      {
        name: 'Eval Regression Coverage',
        scorers: [scorer],
        thresholds: {
          minOverallScore: 0.5,
          maxLatencyMs: 1000,
        },
      },
      results
    );

    expect(report.summary.byCategory.code_search?.count).toBe(1);
    expect(report.summary.byCategory.symbol_lookup?.count).toBe(1);
    expect(report.summary.byCategory.general).toBeUndefined();
  });

  it('treats an unavailable LLM judge as neutral instead of penalizing the run', async () => {
    const scorer = new ReasoningScorer();
    const testCase: EvalTestCase = {
      name: 'judge_unavailable_is_neutral',
      prompt: 'Explain how the scorer should behave.',
      category: 'code_search',
      expected: { status: 'hasResults' },
    };

    const score = await scorer.score(
      [
        {
          status: 'hasResults',
          resultCount: 1,
          content: 'A valid answer with no judge configured.',
        },
      ],
      testCase.expected,
      {
        tools: [],
        testCase,
        startTime: 0,
        endTime: 50,
      }
    );

    expect(score).toBe(0.5);
  });

  it('grades the final answer text even when tool payloads are sparse', async () => {
    const scorer = new AccuracyScorer();
    const testCase: EvalTestCase = {
      name: 'final_answer_grounding',
      prompt: 'Explain how cacheComponents works.',
      category: 'code_search',
      expected: {
        status: 'hasResults',
        mustContain: ['cacheComponents', 'use cache', 'cacheLife'],
      },
    };

    const score = await scorer.score(
      [
        {
          status: 'hasResults',
          resultCount: 1,
          content: 'Opened the docs.',
        },
      ],
      testCase.expected,
      {
        tools: ['githubSearchCode'],
        testCase,
        startTime: 0,
        endTime: 25,
        finalResponse:
          'Enable cacheComponents in next.config, add the "use cache" directive, and configure cacheLife for the cached segment.',
      }
    );

    expect(score).toBeGreaterThan(0.7);
  });

  it('uses provider-specific expected tools when scoring multi-provider benchmarks', async () => {
    const scorer = new ToolSelectionScorer();
    const expected = {
      expectedToolsByProvider: {
        octocode: ['githubSearchCode'],
        context7: ['query-docs'],
      },
    };

    const octocodeScore = await scorer.score([], expected, {
      provider: 'octocode',
      tools: ['githubSearchCode'],
      testCase: {
        name: 'provider_specific_tools',
        prompt: 'test',
        category: 'code_search',
        expected,
      },
      startTime: 0,
      endTime: 1,
    });

    const context7Score = await scorer.score([], expected, {
      provider: 'context7',
      tools: ['query-docs'],
      testCase: {
        name: 'provider_specific_tools',
        prompt: 'test',
        category: 'code_search',
        expected,
      },
      startTime: 0,
      endTime: 1,
    });

    expect(octocodeScore).toBeGreaterThan(0.8);
    expect(context7Score).toBeGreaterThan(0.8);
  });

  it('uses the Claude SDK message shape and enables local Octocode tools for real evals', async () => {
    queryMock.mockReturnValue(
      createAsyncStream([
        {
          type: 'assistant',
          content: [
            { type: 'tool_use', name: 'mcp__octocode__localSearchCode' },
            { type: 'text', text: 'Found src/index.ts' },
          ],
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Final answer',
        },
      ])
    );

    const { runWithProvider } = await import('./utils/sdk-runner.js');
    const result = await runWithProvider('Find createServer', 'octocode', {
      verbose: true,
      maxTurns: 4,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(mcpServerStatusMock).toHaveBeenCalledTimes(1);

    const call = queryMock.mock.calls[0]?.[0];
    expect(call.options.cwd).toBe(EVAL_WORKSPACE_ROOT);
    expect(call.options.allowedTools).toContain(
      'mcp__octocode__localSearchCode'
    );
    expect(call.options.mcpServers.octocode.env.ENABLE_LOCAL).toBe('true');

    expect(result.toolsCalled).toEqual(['localSearchCode']);
    expect(result.response).toBe('Final answer');
  });

  it('falls back to the Claude CLI when the SDK transport is unavailable', async () => {
    process.env.OCTOCODE_EVAL_USE_CLAUDE_CLI = 'true';

    spawnMock.mockImplementation(() =>
      createMockSpawn([
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'mcp__octocode__localSearchCode',
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          tool_use_result: {
            structuredContent: {
              results: [
                {
                  status: 'hasResults',
                  data: {
                    files: [{ path: '/tmp/src/index.ts' }],
                  },
                },
              ],
            },
          },
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'CLI final answer',
        }),
      ])
    );

    const { runWithProvider } = await import('./utils/sdk-runner.js');
    const result = await runWithProvider('Find createServer', 'octocode', {
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 4,
    });

    expect(queryMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [_command, args] = spawnMock.mock.calls[0] ?? [];
    expect(args).toContain('--tools');
    expect(args).toContain('');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('--mcp-config');
    expect(args).toContain('--system-prompt');
    expect(args).toContain('sonnet');

    expect(result.toolsCalled).toEqual(['localSearchCode']);
    expect(result.toolResponses[0]?.status).toBe('hasResults');
    expect(result.response).toBe('CLI final answer');
  });

  it('counts codex octocode tool-call start events as real provider usage', async () => {
    spawnMock.mockImplementation((command: string) => {
      expect(command).toBe('codex');
      return createMockSpawn([
        JSON.stringify({
          type: 'item.started',
          item: {
            id: 'item_1',
            type: 'mcp_tool_call',
            server: 'octocode',
            tool: 'githubSearchCode',
          },
        }),
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'item_2',
            type: 'agent_message',
            text: 'Codex final answer',
          },
        }),
      ]);
    });

    const { runWithProvider } = await import('./utils/sdk-runner.js');
    const result = await runWithProvider(
      'Find the Next.js docs for async cookies',
      'octocode',
      {
        client: 'codex',
      }
    );

    expect(result.toolsCalled).toEqual(['githubSearchCode']);
    expect(
      result.toolResponses.some(
        response =>
          response.status === 'error' &&
          response.error?.includes('no octocode tool call was observed')
      )
    ).toBe(false);
    expect(result.response).toBe('Codex final answer');
  });

  it('uses inline Octocode MCP config for codex cli runs', async () => {
    spawnMock.mockImplementation((command: string) => {
      expect(command).toBe('codex');
      return createMockSpawn([
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'item_1',
            type: 'mcp_tool_call',
            server: 'octocode',
            tool: 'localSearchCode',
            result: {
              structured_content: {
                results: [
                  {
                    status: 'hasResults',
                    data: {
                      files: [{ path: '/tmp/src/index.ts' }],
                    },
                  },
                ],
              },
            },
          },
        }),
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'item_2',
            type: 'agent_message',
            text: 'Codex final answer',
          },
        }),
      ]);
    });

    const { runWithProvider } = await import('./utils/sdk-runner.js');
    const result = await runWithProvider('Find createServer', 'octocode', {
      client: 'codex',
    });

    const [_command, args] = spawnMock.mock.calls[0] ?? [];
    expect(args).toContain('exec');
    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).toContain('mcp_servers.octocode.command="npx"');
    expect(args).toContain(
      'mcp_servers.octocode.args=["-y","octocode-mcp@latest"]'
    );

    expect(result.toolsCalled).toEqual(['localSearchCode']);
    expect(result.toolResponses[0]?.status).toBe('hasResults');
    expect(result.response).toBe('Codex final answer');
  });

  it('counts cursor octocode tool-call start events as real provider usage', async () => {
    spawnMock.mockImplementation((command: string) => {
      expect(command).toBe('cursor');
      return createMockSpawn([
        JSON.stringify({
          type: 'tool_call',
          subtype: 'started',
          call_id: 'tool_1',
          tool_call: {
            mcpToolCall: {
              args: {
                name: 'octocode-packageSearch',
                toolName: 'packageSearch',
              },
            },
          },
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Cursor final answer',
        }),
      ]);
    });

    const { runWithProvider } = await import('./utils/sdk-runner.js');
    const result = await runWithProvider(
      'Find the Next.js package repository',
      'octocode',
      {
        client: 'cursor',
      }
    );

    expect(result.toolsCalled).toEqual(['packageSearch']);
    expect(
      result.toolResponses.some(
        response =>
          response.status === 'error' &&
          response.error?.includes('no octocode tool call was observed')
      )
    ).toBe(false);
    expect(result.response).toBe('Cursor final answer');
  });

  it('treats cursor octocode runs without a successful octocode tool call as an error', async () => {
    spawnMock.mockImplementation((command: string) => {
      expect(command).toBe('cursor');
      return createMockSpawn([
        JSON.stringify({
          type: 'tool_call',
          subtype: 'completed',
          call_id: 'tool_grep_1',
          tool_call: {
            grepToolCall: {
              result: {
                success: {
                  workspaceResults: {
                    [EVAL_WORKSPACE_ROOT]: {
                      content: {
                        matches: [
                          {
                            file: './src/index.ts',
                            matches: [
                              {
                                lineNumber: 185,
                                content:
                                  'async function createServer(content: CompleteMetadata): Promise<McpServer> {',
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Cursor final answer',
        }),
      ]);
    });

    const { runWithProvider } = await import('./utils/sdk-runner.js');
    const result = await runWithProvider('Find createServer', 'octocode', {
      client: 'cursor',
    });

    const [_command, args] = spawnMock.mock.calls[0] ?? [];
    expect(args).toContain('--approve-mcps');
    expect(args).toContain('--yolo');
    expect(args).toContain('disabled');

    expect(result.toolsCalled).toEqual(['grep']);
    expect(result.toolResponses.at(-1)?.status).toBe('error');
    expect(result.response).toBe('Cursor final answer');
  });
});
