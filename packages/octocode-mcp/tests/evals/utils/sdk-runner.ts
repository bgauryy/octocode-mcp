/**
 * Real Eval Runner using Claude Agent SDK
 *
 * Runs prompts with different MCP providers to compare research quality:
 * - Octocode MCP
 * - Context7 MCP
 * - No tools (baseline)
 */

/* eslint-disable no-console */
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  EvalTestCase,
  ToolResponse,
  EvalResult,
} from '../scorers/types.js';
import { createDefaultScorers } from '../scorers/index.js';
import { runSingleEval } from './eval-runner.js';

export type McpProvider = 'octocode' | 'context7' | 'none';

export interface SdkRunnerOptions {
  model?: string;
  maxTurns?: number;
  timeout?: number;
  verbose?: boolean;
}

export interface ProviderResult {
  provider: McpProvider;
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
  latencyMs: number;
  evalResult: EvalResult;
}

export interface MultiProviderEvalResult {
  testCase: string;
  results: Record<McpProvider, ProviderResult>;
  rankings: McpProvider[];
  deltas: {
    octocodeVsBaseline: number;
    context7VsBaseline: number;
    octocodeVsContext7: number;
  };
}

const DEFAULT_OPTIONS: SdkRunnerOptions = {
  model: 'claude-sonnet-4-5-20250929',
  maxTurns: 10,
  timeout: 60000,
  verbose: false,
};

const SYSTEM_PROMPTS: Record<McpProvider, string> = {
  octocode: `You are a code research assistant with access to Octocode MCP tools.
You MUST use the available Octocode tools to research and answer the user's question.
Available tools:
- githubSearchCode: Search for code patterns in GitHub repositories
- githubGetFileContent: Read file contents from GitHub
- githubViewRepoStructure: View repository directory structure
- githubSearchRepositories: Find relevant repositories
- githubSearchPullRequests: Find PRs that introduced features/changes
- packageSearch: Look up npm/pypi packages and their repositories

IMPORTANT: Always use these tools to find accurate, up-to-date information. Do not rely solely on your training data.
When answering, cite the specific files and code you found.`,

  context7: `You are a code research assistant with access to Context7 documentation tools.
You MUST use the available Context7 tools to research and answer the user's question.
Available tools:
- resolve-library-id: Find the Context7 library ID for a package
- query-docs: Query documentation for a specific library

IMPORTANT: Always use these tools to find accurate, up-to-date documentation. Do not rely solely on your training data.
First resolve the library ID, then query the docs.`,

  none: `You are a code research assistant. Answer the user's question to the best of your ability using your training knowledge.
Note: You do not have access to external tools or real-time information.`,
};

const MCP_CONFIGS: Record<
  McpProvider,
  {
    servers: Record<string, { command: string; args: string[] }>;
    allowedTools: string[];
    systemPrompt: string;
  }
> = {
  octocode: {
    servers: {
      octocode: {
        command: 'npx',
        args: ['-y', 'octocode-mcp@latest'],
      },
    },
    allowedTools: [
      'mcp__octocode__githubSearchCode',
      'mcp__octocode__githubGetFileContent',
      'mcp__octocode__githubViewRepoStructure',
      'mcp__octocode__githubSearchRepositories',
      'mcp__octocode__githubSearchPullRequests',
      'mcp__octocode__packageSearch',
      'mcp__octocode__localSearchCode',
      'mcp__octocode__localViewStructure',
      'mcp__octocode__localFindFiles',
      'mcp__octocode__localGetFileContent',
      'mcp__octocode__lspGotoDefinition',
      'mcp__octocode__lspFindReferences',
      'mcp__octocode__lspCallHierarchy',
    ],
    systemPrompt: SYSTEM_PROMPTS.octocode,
  },
  context7: {
    servers: {
      context7: {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp@latest'],
      },
    },
    allowedTools: [
      'mcp__context7__resolve-library-id',
      'mcp__context7__query-docs',
    ],
    systemPrompt: SYSTEM_PROMPTS.context7,
  },
  none: {
    servers: {},
    allowedTools: [],
    systemPrompt: SYSTEM_PROMPTS.none,
  },
};

/**
 * Run a single prompt with a specific MCP provider
 */
export async function runWithProvider(
  prompt: string,
  provider: McpProvider,
  options: SdkRunnerOptions = {}
): Promise<{
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const config = MCP_CONFIGS[provider];
  const toolsCalled: string[] = [];
  const toolResponses: ToolResponse[] = [];
  let response = '';

  try {
    // Combine system prompt with user prompt
    const fullPrompt = `${config.systemPrompt}\n\n---\n\nUser Question: ${prompt}`;

    const q = query({
      prompt: fullPrompt,
      options: {
        model: opts.model,
        maxTurns: provider === 'none' ? 1 : opts.maxTurns,
        mcpServers: config.servers,
        // Bypass permissions for automated eval
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    // Check MCP server status
    if (opts.verbose && provider !== 'none') {
      try {
        const mcpStatus = await q.mcpServerStatus();
        console.log(`[${provider}] MCP Status:`, JSON.stringify(mcpStatus));
      } catch (e) {
        console.log(`[${provider}] MCP Status error:`, e);
      }
    }

    for await (const message of q) {
      if (opts.verbose) {
        console.log(`[${provider}] Message:`, message.type);
        if (message.type === 'system') {
          console.log(`[${provider}] Tools available:`, (message as { tools?: string[] }).tools?.length || 0);
        }
      }

      // Extract tool calls
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              toolsCalled.push(block.name);
              if (opts.verbose) {
                console.log(`[${provider}] Tool call:`, block.name);
              }
            }
            if (block.type === 'text') {
              response += block.text;
            }
          }
        }
      }

      // Final result
      if (message.type === 'result' && message.subtype === 'success') {
        response = message.result || response;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    toolResponses.push({
      status: 'error',
      error: errorMessage,
      content: errorMessage,
      resultCount: 0,
    });
    if (opts.verbose) {
      console.error(`[${provider}] Error:`, errorMessage);
    }
  }

  return { response, toolsCalled, toolResponses };
}

// Legacy exports for backwards compatibility
export async function runWithOctocode(
  prompt: string,
  options: SdkRunnerOptions = {}
) {
  return runWithProvider(prompt, 'octocode', options);
}

export async function runWithContext7(
  prompt: string,
  options: SdkRunnerOptions = {}
) {
  return runWithProvider(prompt, 'context7', options);
}

export async function runWithoutOctocode(
  prompt: string,
  options: SdkRunnerOptions = {}
): Promise<{ response: string }> {
  const result = await runWithProvider(prompt, 'none', options);
  return { response: result.response };
}

/**
 * Run eval with a single provider and score it
 */
async function runAndScoreProvider(
  testCase: EvalTestCase,
  provider: McpProvider,
  options: SdkRunnerOptions
): Promise<ProviderResult> {
  const scorers = createDefaultScorers();
  const startTime = Date.now();

  const result = await runWithProvider(testCase.prompt, provider, options);

  const endTime = Date.now();

  const responses: ToolResponse[] =
    result.toolResponses.length > 0
      ? result.toolResponses
      : [
          {
            status: result.toolsCalled.length > 0 ? 'hasResults' : 'empty',
            content: result.response,
            resultCount: result.toolsCalled.length > 0 ? 1 : 0,
          },
        ];

  const evalResult = await runSingleEval(
    testCase,
    responses,
    result.toolsCalled,
    scorers,
    startTime,
    endTime
  );

  return {
    provider,
    response: result.response,
    toolsCalled: result.toolsCalled,
    toolResponses: result.toolResponses,
    latencyMs: endTime - startTime,
    evalResult,
  };
}

/**
 * Run a full multi-provider comparison eval for a test case
 */
export async function runMultiProviderEval(
  testCase: EvalTestCase,
  providers: McpProvider[] = ['octocode', 'context7', 'none'],
  options: SdkRunnerOptions = {}
): Promise<MultiProviderEvalResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.verbose) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testCase.name}`);
    console.log(`Prompt: ${testCase.prompt.slice(0, 80)}...`);
    console.log(`Providers: ${providers.join(', ')}`);
  }

  const results: Record<McpProvider, ProviderResult> = {} as Record<
    McpProvider,
    ProviderResult
  >;

  for (const provider of providers) {
    if (opts.verbose) {
      console.log(`\n  [${provider}] Starting...`);
    }

    results[provider] = await runAndScoreProvider(testCase, provider, opts);

    if (opts.verbose) {
      console.log(
        `  [${provider}] Score: ${(results[provider].evalResult.overall * 100).toFixed(1)}%`
      );
      console.log(
        `  [${provider}] Tools: ${results[provider].toolsCalled.length}`
      );
      console.log(`  [${provider}] Latency: ${results[provider].latencyMs}ms`);
    }
  }

  // Rank providers by score
  const rankings = providers
    .filter(p => results[p])
    .sort(
      (a, b) => results[b].evalResult.overall - results[a].evalResult.overall
    );

  // Calculate deltas
  const octocodeScore = results.octocode?.evalResult.overall ?? 0;
  const context7Score = results.context7?.evalResult.overall ?? 0;
  const baselineScore = results.none?.evalResult.overall ?? 0;

  return {
    testCase: testCase.name,
    results,
    rankings,
    deltas: {
      octocodeVsBaseline: octocodeScore - baselineScore,
      context7VsBaseline: context7Score - baselineScore,
      octocodeVsContext7: octocodeScore - context7Score,
    },
  };
}

/**
 * Run batch multi-provider evals
 */
export async function runBatchMultiProviderEval(
  testCases: EvalTestCase[],
  providers: McpProvider[] = ['octocode', 'context7', 'none'],
  options: SdkRunnerOptions = {}
): Promise<{
  results: MultiProviderEvalResult[];
  summary: {
    total: number;
    byProvider: Record<McpProvider, { avgScore: number; avgLatency: number }>;
    octocodeWins: number;
    context7Wins: number;
    ties: number;
    avgDeltas: {
      octocodeVsBaseline: number;
      context7VsBaseline: number;
      octocodeVsContext7: number;
    };
  };
}> {
  const results: MultiProviderEvalResult[] = [];

  for (const testCase of testCases) {
    try {
      const result = await runMultiProviderEval(testCase, providers, options);
      results.push(result);
    } catch (error) {
      console.error(`Error running ${testCase.name}:`, error);
    }
  }

  // Calculate summary stats
  const byProvider: Record<
    McpProvider,
    { avgScore: number; avgLatency: number }
  > = {} as Record<McpProvider, { avgScore: number; avgLatency: number }>;

  for (const provider of providers) {
    const providerResults = results
      .filter(r => r.results[provider])
      .map(r => r.results[provider]);

    byProvider[provider] = {
      avgScore:
        providerResults.reduce((sum, r) => sum + r.evalResult.overall, 0) /
          providerResults.length || 0,
      avgLatency:
        providerResults.reduce((sum, r) => sum + r.latencyMs, 0) /
          providerResults.length || 0,
    };
  }

  // Count wins (Octocode vs Context7)
  let octocodeWins = 0;
  let context7Wins = 0;
  let ties = 0;

  for (const result of results) {
    const octocodeScore = result.results.octocode?.evalResult.overall ?? 0;
    const context7Score = result.results.context7?.evalResult.overall ?? 0;

    if (Math.abs(octocodeScore - context7Score) < 0.01) {
      ties++;
    } else if (octocodeScore > context7Score) {
      octocodeWins++;
    } else {
      context7Wins++;
    }
  }

  // Average deltas
  const avgDeltas = {
    octocodeVsBaseline:
      results.reduce((sum, r) => sum + r.deltas.octocodeVsBaseline, 0) /
        results.length || 0,
    context7VsBaseline:
      results.reduce((sum, r) => sum + r.deltas.context7VsBaseline, 0) /
        results.length || 0,
    octocodeVsContext7:
      results.reduce((sum, r) => sum + r.deltas.octocodeVsContext7, 0) /
        results.length || 0,
  };

  return {
    results,
    summary: {
      total: results.length,
      byProvider,
      octocodeWins,
      context7Wins,
      ties,
      avgDeltas,
    },
  };
}

/**
 * Format multi-provider comparison results for console output
 */
export function formatMultiProviderResults(
  results: MultiProviderEvalResult[],
  summary: {
    total: number;
    byProvider: Record<McpProvider, { avgScore: number; avgLatency: number }>;
    octocodeWins: number;
    context7Wins: number;
    ties: number;
    avgDeltas: {
      octocodeVsBaseline: number;
      context7VsBaseline: number;
      octocodeVsContext7: number;
    };
  }
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );
  lines.push(
    '                    OCTOCODE vs CONTEXT7 vs BASELINE                          '
  );
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );
  lines.push('');
  lines.push(
    'Test Case                            Octocode  Context7  Baseline   Winner'
  );
  lines.push(
    '─────────────────────────────────────────────────────────────────────────────'
  );

  for (const result of results) {
    const name = result.testCase.slice(0, 35).padEnd(35);
    const octocode = result.results.octocode
      ? `${(result.results.octocode.evalResult.overall * 100).toFixed(0)}%`.padStart(
          6
        )
      : '  N/A ';
    const context7 = result.results.context7
      ? `${(result.results.context7.evalResult.overall * 100).toFixed(0)}%`.padStart(
          6
        )
      : '  N/A ';
    const baseline = result.results.none
      ? `${(result.results.none.evalResult.overall * 100).toFixed(0)}%`.padStart(
          6
        )
      : '  N/A ';

    const winner = result.rankings[0] ?? 'none';
    const winnerIcon =
      winner === 'octocode' ? '🔵' : winner === 'context7' ? '🟢' : '⚪';

    lines.push(
      `${name}  ${octocode}    ${context7}    ${baseline}    ${winnerIcon} ${winner}`
    );
  }

  lines.push('');
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );
  lines.push(
    '                              SUMMARY                                        '
  );
  lines.push(
    '─────────────────────────────────────────────────────────────────────────────'
  );

  // Provider averages
  lines.push('');
  lines.push('Average Scores:');
  if (summary.byProvider.octocode) {
    lines.push(
      `  🔵 Octocode:  ${(summary.byProvider.octocode.avgScore * 100).toFixed(1)}%  (avg ${Math.round(summary.byProvider.octocode.avgLatency)}ms)`
    );
  }
  if (summary.byProvider.context7) {
    lines.push(
      `  🟢 Context7:  ${(summary.byProvider.context7.avgScore * 100).toFixed(1)}%  (avg ${Math.round(summary.byProvider.context7.avgLatency)}ms)`
    );
  }
  if (summary.byProvider.none) {
    lines.push(
      `  ⚪ Baseline:  ${(summary.byProvider.none.avgScore * 100).toFixed(1)}%  (avg ${Math.round(summary.byProvider.none.avgLatency)}ms)`
    );
  }

  lines.push('');
  lines.push('Head-to-Head (Octocode vs Context7):');
  lines.push(
    `  Octocode wins: ${summary.octocodeWins}  |  Context7 wins: ${summary.context7Wins}  |  Ties: ${summary.ties}`
  );

  lines.push('');
  lines.push('Improvement Over Baseline:');
  lines.push(
    `  Octocode: ${summary.avgDeltas.octocodeVsBaseline >= 0 ? '+' : ''}${(summary.avgDeltas.octocodeVsBaseline * 100).toFixed(1)}%`
  );
  lines.push(
    `  Context7: ${summary.avgDeltas.context7VsBaseline >= 0 ? '+' : ''}${(summary.avgDeltas.context7VsBaseline * 100).toFixed(1)}%`
  );

  lines.push('');
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );

  return lines.join('\n');
}

// Legacy types and functions for backwards compatibility
export interface SdkEvalResult {
  testCase: string;
  withOctocode: EvalResult;
  withoutOctocode: EvalResult;
  delta: number;
  improved: boolean;
  toolsUsed: string[];
  rawResponses: {
    with: string;
    without: string;
  };
}

export async function runComparisonEval(
  testCase: EvalTestCase,
  options: SdkRunnerOptions = {}
): Promise<SdkEvalResult> {
  const result = await runMultiProviderEval(
    testCase,
    ['octocode', 'none'],
    options
  );

  return {
    testCase: testCase.name,
    withOctocode: result.results.octocode.evalResult,
    withoutOctocode: result.results.none.evalResult,
    delta: result.deltas.octocodeVsBaseline,
    improved: result.deltas.octocodeVsBaseline > 0,
    toolsUsed: result.results.octocode.toolsCalled,
    rawResponses: {
      with: result.results.octocode.response,
      without: result.results.none.response,
    },
  };
}

export async function runBatchComparisonEval(
  testCases: EvalTestCase[],
  options: SdkRunnerOptions = {}
): Promise<{
  results: SdkEvalResult[];
  summary: {
    total: number;
    improved: number;
    degraded: number;
    avgDelta: number;
    avgWithScore: number;
    avgWithoutScore: number;
  };
}> {
  const batchResult = await runBatchMultiProviderEval(
    testCases,
    ['octocode', 'none'],
    options
  );

  const results: SdkEvalResult[] = batchResult.results.map(r => ({
    testCase: r.testCase,
    withOctocode: r.results.octocode.evalResult,
    withoutOctocode: r.results.none.evalResult,
    delta: r.deltas.octocodeVsBaseline,
    improved: r.deltas.octocodeVsBaseline > 0,
    toolsUsed: r.results.octocode.toolsCalled,
    rawResponses: {
      with: r.results.octocode.response,
      without: r.results.none.response,
    },
  }));

  const improved = results.filter(r => r.improved).length;
  const degraded = results.filter(r => !r.improved && r.delta < 0).length;

  return {
    results,
    summary: {
      total: results.length,
      improved,
      degraded,
      avgDelta: batchResult.summary.avgDeltas.octocodeVsBaseline,
      avgWithScore: batchResult.summary.byProvider.octocode?.avgScore ?? 0,
      avgWithoutScore: batchResult.summary.byProvider.none?.avgScore ?? 0,
    },
  };
}

export function formatComparisonResults(
  results: SdkEvalResult[],
  summary: {
    total: number;
    improved: number;
    degraded: number;
    avgDelta: number;
    avgWithScore: number;
    avgWithoutScore: number;
  }
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(
    '                 OCTOCODE vs BASELINE COMPARISON                '
  );
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  for (const result of results) {
    const icon = result.improved ? '↑' : result.delta < 0 ? '↓' : '=';
    const withScore = (result.withOctocode.overall * 100).toFixed(1);
    const withoutScore = (result.withoutOctocode.overall * 100).toFixed(1);
    const delta = (result.delta * 100).toFixed(1);
    const deltaStr = result.delta >= 0 ? `+${delta}` : delta;
    const name = result.testCase.slice(0, 35).padEnd(35);
    const tools = result.toolsUsed.length;

    lines.push(
      `${icon} ${name} ${withScore.padStart(5)}% vs ${withoutScore.padStart(5)}%  (${deltaStr.padStart(6)}%)  [${tools} tools]`
    );
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(
    `Total: ${summary.total} | Improved: ${summary.improved} | Degraded: ${summary.degraded}`
  );
  lines.push(
    `Avg With Octocode: ${(summary.avgWithScore * 100).toFixed(1)}% | Without: ${(summary.avgWithoutScore * 100).toFixed(1)}%`
  );
  lines.push(
    `Average Delta: ${summary.avgDelta >= 0 ? '+' : ''}${(summary.avgDelta * 100).toFixed(1)}%`
  );
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
