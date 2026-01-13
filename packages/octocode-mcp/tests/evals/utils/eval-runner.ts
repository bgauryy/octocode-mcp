/**
 * Eval Runner - Main orchestration for running evaluations
 */

import type {
  EvalConfig,
  EvalResult,
  EvalReport,
  EvalComparison,
  EvalTestCase,
  EvalContext,
  EvalScorer,
  ToolResponse,
} from '../scorers/types.js';
import { createDefaultScorers, DEFAULT_WEIGHTS } from '../scorers/index.js';

export interface RunEvalOptions {
  verbose?: boolean;
  skipLLMJudge?: boolean;
  saveResults?: boolean;
  outputPath?: string;
}

/**
 * Run a single test case with all scorers
 */
export async function runSingleEval(
  testCase: EvalTestCase,
  responses: ToolResponse[],
  toolsCalled: string[],
  scorers: EvalScorer[],
  startTime: number,
  endTime: number
): Promise<EvalResult> {
  const ctx: EvalContext = {
    tools: toolsCalled,
    testCase,
    startTime,
    endTime,
  };

  const scores: Record<string, number> = {};
  const explanations: Record<string, string> = {};

  // Run all scorers
  for (const scorer of scorers) {
    try {
      const score = await scorer.score(responses, testCase.expected, ctx);
      const explanation = await scorer.explain(
        responses,
        testCase.expected,
        ctx
      );

      scores[scorer.name] = score;
      explanations[scorer.name] = explanation;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      scores[scorer.name] = 0;
      explanations[scorer.name] = `Scorer error: ${errorMessage}`;
    }
  }

  // Calculate weighted overall score
  let overall = 0;
  let totalWeight = 0;

  for (const scorer of scorers) {
    const weight =
      scorer.weight ??
      DEFAULT_WEIGHTS[scorer.name as keyof typeof DEFAULT_WEIGHTS] ??
      0.2;
    overall += (scores[scorer.name] ?? 0) * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    overall = overall / totalWeight;
  }

  return {
    testCase: testCase.name,
    scores,
    overall,
    explanations,
    latencyMs: endTime - startTime,
    toolsCalled,
    toolResponses: responses,
    timestamp: new Date().toISOString(),
    success: overall >= 0.5,
  };
}

/**
 * Compare results from two eval runs (with vs without Octocode)
 */
export function compareResults(
  withOctocode: EvalResult,
  withoutOctocode: EvalResult
): EvalComparison {
  const deltaByScorer: Record<string, number> = {};

  for (const scorerName of Object.keys(withOctocode.scores)) {
    const withScore = withOctocode.scores[scorerName] ?? 0;
    const withoutScore = withoutOctocode.scores[scorerName] ?? 0;
    deltaByScorer[scorerName] = withScore - withoutScore;
  }

  return {
    testCase: withOctocode.testCase,
    withOctocode,
    withoutOctocode,
    delta: {
      overall: withOctocode.overall - withoutOctocode.overall,
      byScorer: deltaByScorer,
      latencyDelta: withOctocode.latencyMs - withoutOctocode.latencyMs,
    },
    improved: withOctocode.overall > withoutOctocode.overall,
  };
}

/**
 * Generate a summary report from eval results
 */
export function generateReport(
  config: EvalConfig,
  results: EvalResult[],
  comparisons?: EvalComparison[]
): EvalReport {
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;

  const averageScore =
    results.reduce((sum, r) => sum + r.overall, 0) / results.length || 0;
  const averageLatency =
    results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length || 0;

  // Group by category
  const byCategory: Record<string, { count: number; totalScore: number }> = {};

  for (const result of results) {
    // Extract category from test case name or use default
    const category = extractCategory(result.testCase);

    if (!byCategory[category]) {
      byCategory[category] = { count: 0, totalScore: 0 };
    }
    byCategory[category].count++;
    byCategory[category].totalScore += result.overall;
  }

  const categorySummary: Record<string, { count: number; avgScore: number }> =
    {};
  for (const [cat, data] of Object.entries(byCategory)) {
    categorySummary[cat] = {
      count: data.count,
      avgScore: data.totalScore / data.count,
    };
  }

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    config,
    results,
    summary: {
      totalTests: results.length,
      passed,
      failed,
      averageScore,
      averageLatency,
      byCategory: categorySummary,
    },
    comparisons,
  };
}

/**
 * Create a default eval config
 */
export function createDefaultConfig(
  name: string = 'Octocode Eval'
): EvalConfig {
  return {
    name,
    description: 'Default Octocode evaluation configuration',
    scorers: createDefaultScorers(),
    thresholds: {
      minOverallScore: 0.5,
      maxLatencyMs: 10000,
    },
    llmJudge: {
      enabled: true,
      model: 'gpt-4o-mini',
    },
  };
}

/**
 * Format eval results for console output
 */
export function formatResultsTable(results: EvalResult[]): string {
  const lines: string[] = [];

  lines.push(
    '┌────────────────────────────────────────────────────────────────┐'
  );
  lines.push(
    '│                    EVAL RESULTS SUMMARY                        │'
  );
  lines.push(
    '├────────────────────────────────────────────────────────────────┤'
  );

  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    const score = (result.overall * 100).toFixed(1).padStart(5);
    const name = result.testCase.slice(0, 40).padEnd(40);
    const latency = `${result.latencyMs}ms`.padStart(8);

    lines.push(`│ ${status} ${name} ${score}% ${latency} │`);
  }

  lines.push(
    '├────────────────────────────────────────────────────────────────┤'
  );

  const avgScore = (
    (results.reduce((s, r) => s + r.overall, 0) / results.length) *
    100
  ).toFixed(1);
  const avgLatency = Math.round(
    results.reduce((s, r) => s + r.latencyMs, 0) / results.length
  );
  const passRate = (
    (results.filter(r => r.success).length / results.length) *
    100
  ).toFixed(1);

  lines.push(
    `│ Average Score: ${avgScore.padStart(5)}%  Avg Latency: ${avgLatency}ms  Pass: ${passRate}%    │`
  );
  lines.push(
    '└────────────────────────────────────────────────────────────────┘'
  );

  return lines.join('\n');
}

/**
 * Format comparison results
 */
export function formatComparisonTable(comparisons: EvalComparison[]): string {
  const lines: string[] = [];

  lines.push(
    '┌────────────────────────────────────────────────────────────────┐'
  );
  lines.push(
    '│                WITH vs WITHOUT OCTOCODE                        │'
  );
  lines.push(
    '├────────────────────────────────────────────────────────────────┤'
  );

  for (const comp of comparisons) {
    const improved = comp.improved ? '↑' : '↓';
    const delta = (comp.delta.overall * 100).toFixed(1);
    const deltaStr = comp.delta.overall >= 0 ? `+${delta}` : delta;
    const name = comp.testCase.slice(0, 35).padEnd(35);
    const withScore = (comp.withOctocode.overall * 100).toFixed(1);
    const withoutScore = (comp.withoutOctocode.overall * 100).toFixed(1);

    lines.push(
      `│ ${improved} ${name} ${withScore.padStart(5)}% vs ${withoutScore.padStart(5)}% (${deltaStr.padStart(6)}%) │`
    );
  }

  lines.push(
    '├────────────────────────────────────────────────────────────────┤'
  );

  const improved = comparisons.filter(c => c.improved).length;
  const total = comparisons.length;
  const avgDelta =
    (comparisons.reduce((s, c) => s + c.delta.overall, 0) / total) * 100;

  lines.push(
    `│ Improved: ${improved}/${total}  Average Delta: ${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(1)}%                    │`
  );
  lines.push(
    '└────────────────────────────────────────────────────────────────┘'
  );

  return lines.join('\n');
}

// Helper to extract category from test case name
function extractCategory(testCaseName: string): string {
  const lowerName = testCaseName.toLowerCase();

  if (lowerName.includes('code') || lowerName.includes('search')) {
    return 'code_search';
  }
  if (lowerName.includes('file') || lowerName.includes('discover')) {
    return 'file_discovery';
  }
  if (lowerName.includes('symbol') || lowerName.includes('definition')) {
    return 'symbol_lookup';
  }
  if (lowerName.includes('package') || lowerName.includes('npm')) {
    return 'package_search';
  }
  if (lowerName.includes('pr') || lowerName.includes('pull')) {
    return 'pr_archaeology';
  }
  if (lowerName.includes('error') || lowerName.includes('invalid')) {
    return 'error_handling';
  }

  return 'general';
}
