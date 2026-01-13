#!/usr/bin/env node
/**
 * Knowledge Gap Eval v3 - Tests if tools help AI answer questions beyond training
 *
 * Improvements over v2:
 * - Multiple runs per test for statistical rigor
 * - Randomized provider order to avoid ordering bias
 * - Blind LLM judge (factuality-style categories, not ground truth comparison)
 * - Same system prompt for all providers (no bias)
 * - Same maxTurns for all providers
 * - Confidence intervals and standard deviation
 * - Fixed winner logic bug
 *
 * Scoring:
 * - Exact Match (40%): Response must contain exact strings
 * - LLM Judge (60%): Blind factuality evaluation using categories
 *
 * Usage:
 *   npx tsx tests/evals/run-knowledge-eval.ts [options]
 *   --runs N     Number of runs per test (default: 1, recommend 3+ for stats)
 *   --limit N    Limit number of test cases
 *   --verbose    Show detailed output
 */

/* eslint-disable no-console */
import { query } from '@anthropic-ai/claude-agent-sdk';

interface KnowledgeTestCase {
  name: string;
  description: string;
  prompt: string;
  difficulty: number;
  groundTruth: {
    exactMatch: string[];
    validationQuery: string;
  };
  tags: string[];
}

interface RunResult {
  response: string;
  latencyMs: number;
  exactMatchScore: number;
  llmJudgeScore: number;
  score: number;
  exactMatches: string[];
  exactMisses: string[];
  llmJudgeCategory: string;
  llmJudgeReason: string;
}

interface ProviderStats {
  provider: string;
  runs: RunResult[];
  mean: number;
  stdDev: number;
  ci95: [number, number];
  meanLatency: number;
  meanExact: number;
  meanJudge: number;
}

interface TestResult {
  testCase: string;
  difficulty: number;
  stats: Record<string, ProviderStats>;
  winner: string;
  significant: boolean;
}

// Same system prompt for ALL providers - no bias
const SYSTEM_PROMPT = `You are a coding assistant answering technical questions.
Answer precisely with exact values when asked for specifics.
If you have access to tools, use them to find accurate information.
If you don't have tools or can't find the answer, provide your best knowledge-based response.`;

const PROVIDERS = {
  octocode: {
    servers: {
      octocode: { command: 'npx', args: ['-y', 'octocode-mcp@latest'] }
    }
  },
  context7: {
    servers: {
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }
    }
  },
  none: {
    servers: {}
  }
};

// Blind LLM Judge - uses factuality categories instead of showing ground truth
// Based on promptfoo/OpenAI evals factuality approach
const BLIND_JUDGE_PROMPT = `You are evaluating the factual accuracy of a technical answer.

QUESTION: {question}

RESPONSE TO EVALUATE:
{response}

EVALUATION CRITERIA:
{criteria}

Evaluate the response and categorize it:
(A) CORRECT: Response provides accurate, specific information that matches the criteria
(B) PARTIAL: Response has some correct information but is missing key details or has minor errors
(C) INCORRECT: Response provides wrong specific values or contradicts the criteria
(D) UNCERTAIN: Response admits uncertainty, hedges, or says "I don't know"
(E) IRRELEVANT: Response doesn't address the question

Choose the MOST appropriate category. Be strict about specifics - if the question asks for exact values, partial matches or approximations should be category B or C.

Respond with ONLY a JSON object:
{"category": "<A/B/C/D/E>", "reason": "<brief explanation>"}`;

const CATEGORY_SCORES: Record<string, number> = {
  A: 100,
  B: 50,
  C: 0,
  D: 0,  // Admitting uncertainty = not knowing
  E: 0
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function calculateStats(scores: number[]): { mean: number; stdDev: number; ci95: [number, number] } {
  const n = scores.length;
  const mean = scores.reduce((a, b) => a + b, 0) / n;

  if (n < 2) {
    return { mean, stdDev: 0, ci95: [mean, mean] };
  }

  const variance = scores.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  // 95% confidence interval (t-distribution approximation for small samples)
  const tValue = n <= 2 ? 12.71 : n <= 3 ? 4.30 : n <= 5 ? 2.78 : n <= 10 ? 2.26 : 1.96;
  const marginOfError = tValue * (stdDev / Math.sqrt(n));

  return {
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    ci95: [
      Math.round((mean - marginOfError) * 10) / 10,
      Math.round((mean + marginOfError) * 10) / 10
    ]
  };
}

async function runWithProvider(
  prompt: string,
  providerName: string,
  verbose: boolean
): Promise<{ response: string; latencyMs: number }> {
  const provider = PROVIDERS[providerName as keyof typeof PROVIDERS];
  const startTime = Date.now();
  let response = '';

  const fullPrompt = `${SYSTEM_PROMPT}\n\nQuestion: ${prompt}`;

  try {
    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 8, // Same for all providers
        mcpServers: provider.servers,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (verbose && message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              console.log(`    [${providerName}] Tool: ${block.name}`);
            }
          }
        }
      }

      if (message.type === 'result' && message.subtype === 'success') {
        response = message.result || '';
      }
    }
  } catch (error) {
    console.error(`  [${providerName}] Error:`, error);
    response = `Error: ${error}`;
  }

  return { response, latencyMs: Date.now() - startTime };
}

async function blindJudge(
  question: string,
  criteria: string,
  response: string
): Promise<{ category: string; score: number; reason: string }> {
  const prompt = BLIND_JUDGE_PROMPT
    .replace('{question}', question)
    .replace('{criteria}', criteria)
    .replace('{response}', response);

  let result = '';

  try {
    for await (const message of query({
      prompt,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 1,
        mcpServers: {},
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result || '';
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const category = (parsed.category || 'E').toUpperCase();
      return {
        category,
        score: CATEGORY_SCORES[category] ?? 0,
        reason: parsed.reason || 'No reason'
      };
    }
  } catch (error) {
    console.error('  Blind Judge error:', error);
  }

  return { category: 'E', score: 0, reason: 'Failed to judge' };
}

function scoreExactMatch(response: string, exactMatch: string[]): {
  score: number;
  matches: string[];
  misses: string[];
} {
  const matches: string[] = [];
  const misses: string[] = [];

  for (const exact of exactMatch) {
    if (response.includes(exact)) {
      matches.push(exact);
    } else {
      misses.push(exact);
    }
  }

  const score = exactMatch.length > 0
    ? Math.round((matches.length / exactMatch.length) * 100)
    : 100;

  return { score, matches, misses };
}

async function runSingleTest(
  testCase: KnowledgeTestCase,
  providerName: string,
  verbose: boolean
): Promise<RunResult> {
  const { response, latencyMs } = await runWithProvider(testCase.prompt, providerName, verbose);

  // Exact match scoring (40% weight)
  const exact = scoreExactMatch(response, testCase.groundTruth.exactMatch);

  // Blind LLM Judge scoring (60% weight) - doesn't see ground truth, only criteria
  const judge = await blindJudge(
    testCase.prompt,
    testCase.groundTruth.validationQuery,
    response
  );

  // Combined score: 40% exact + 60% judge
  const combinedScore = Math.round(exact.score * 0.4 + judge.score * 0.6);

  return {
    response,
    latencyMs,
    exactMatchScore: exact.score,
    llmJudgeScore: judge.score,
    score: combinedScore,
    exactMatches: exact.matches,
    exactMisses: exact.misses,
    llmJudgeCategory: judge.category,
    llmJudgeReason: judge.reason,
  };
}

async function runTest(
  testCase: KnowledgeTestCase,
  numRuns: number,
  verbose: boolean
): Promise<TestResult> {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`Question: ${testCase.prompt.slice(0, 60)}...`);
  console.log(`Exact match required: ${testCase.groundTruth.exactMatch.join(', ')}`);
  if (numRuns > 1) console.log(`Runs per provider: ${numRuns}`);

  const stats: Record<string, ProviderStats> = {};

  // Randomize provider order for each test
  const providerOrder = shuffleArray(['octocode', 'context7', 'none']);

  for (const providerName of providerOrder) {
    console.log(`\n  Running with ${providerName}...`);

    const runs: RunResult[] = [];

    for (let run = 0; run < numRuns; run++) {
      if (numRuns > 1) console.log(`    Run ${run + 1}/${numRuns}...`);
      const result = await runSingleTest(testCase, providerName, verbose);
      runs.push(result);

      if (verbose) {
        console.log(`      Score: ${result.score}% (exact: ${result.exactMatchScore}%, judge: ${result.llmJudgeScore}% [${result.llmJudgeCategory}])`);
      }
    }

    const scores = runs.map(r => r.score);
    const { mean, stdDev, ci95 } = calculateStats(scores);

    stats[providerName] = {
      provider: providerName,
      runs,
      mean,
      stdDev,
      ci95,
      meanLatency: Math.round(runs.reduce((a, r) => a + r.latencyMs, 0) / runs.length / 100) / 10,
      meanExact: Math.round(runs.reduce((a, r) => a + r.exactMatchScore, 0) / runs.length),
      meanJudge: Math.round(runs.reduce((a, r) => a + r.llmJudgeScore, 0) / runs.length),
    };

    if (numRuns > 1) {
      console.log(`  [${providerName}] Mean: ${mean}% ± ${stdDev}% (95% CI: ${ci95[0]}-${ci95[1]}%)`);
    } else {
      console.log(`  [${providerName}] Score: ${mean}% (exact: ${stats[providerName].meanExact}%, judge: ${stats[providerName].meanJudge}%)`);
    }
    console.log(`  [${providerName}] Latency: ${stats[providerName].meanLatency}s`);
  }

  // Determine winner with proper comparison
  const sorted = Object.values(stats).sort((a, b) => b.mean - a.mean);
  const best = sorted[0];
  const second = sorted[1];

  // Check if difference is significant (non-overlapping confidence intervals)
  const significant = numRuns > 1 && (best.ci95[0] > second.ci95[1]);

  let winner: string;
  if (best.mean > second.mean) {
    winner = best.provider;
  } else if (best.mean === second.mean) {
    winner = 'tie';
  } else {
    winner = second.provider; // This branch can now execute correctly
  }

  return { testCase: testCase.name, difficulty: testCase.difficulty, stats, winner, significant };
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const runsIdx = args.indexOf('--runs');
  const numRuns = runsIdx !== -1 ? parseInt(args[runsIdx + 1], 10) : 1;

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              KNOWLEDGE GAP EVALUATION v3                             ║');
  console.log('║  Scoring: 40% Exact Match + 60% Blind LLM Judge                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\nImprovements in v3:');
  console.log('  - Blind judge (factuality categories, not ground truth comparison)');
  console.log('  - Randomized provider order');
  console.log('  - Same system prompt & maxTurns for all providers');
  if (numRuns > 1) {
    console.log(`  - Statistical rigor: ${numRuns} runs with confidence intervals`);
  }

  const { promises: fs } = await import('fs');
  const { dirname, join } = await import('path');
  const promptsDir = dirname(import.meta.url.replace('file://', ''));

  const verifiedPath = join(promptsDir, 'prompts/manual/verified-knowledge-gaps.json');
  const content = await fs.readFile(verifiedPath, 'utf-8');
  let testCases: KnowledgeTestCase[] = JSON.parse(content);

  if (limit && limit > 0) {
    testCases = testCases.slice(0, limit);
  }

  console.log(`\nRunning ${testCases.length} knowledge gap tests...`);
  if (numRuns > 1) {
    console.log(`Each test runs ${numRuns} times per provider for statistical significance\n`);
  }

  const allResults: TestResult[] = [];

  for (const testCase of testCases) {
    const result = await runTest(testCase, numRuns, verbose);
    allResults.push(result);
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('                           RESULTS SUMMARY');
  console.log('═'.repeat(70));

  console.log('\nPer-test scores:');
  console.log('─'.repeat(70));
  if (numRuns > 1) {
    console.log('Test Case'.padEnd(28) + 'Octocode     Context7     Baseline     Winner');
  } else {
    console.log('Test Case'.padEnd(30) + 'Octocode  Context7  Baseline  Winner');
  }
  console.log('─'.repeat(70));

  for (const result of allResults) {
    const name = result.testCase.slice(0, 26).padEnd(28);
    if (numRuns > 1) {
      const octo = `${result.stats.octocode?.mean}±${result.stats.octocode?.stdDev}`.padStart(10);
      const ctx7 = `${result.stats.context7?.mean}±${result.stats.context7?.stdDev}`.padStart(12);
      const none = `${result.stats.none?.mean}±${result.stats.none?.stdDev}`.padStart(12);
      const sig = result.significant ? '*' : '';
      const winnerIcon = result.winner === 'octocode' ? '🔵' :
                         result.winner === 'context7' ? '🟢' :
                         result.winner === 'none' ? '⚪' : '🟡';
      console.log(`${name}${octo}${ctx7}${none}   ${winnerIcon} ${result.winner}${sig}`);
    } else {
      const octo = `${result.stats.octocode?.mean || 0}%`.padStart(6);
      const ctx7 = `${result.stats.context7?.mean || 0}%`.padStart(8);
      const none = `${result.stats.none?.mean || 0}%`.padStart(8);
      const winnerIcon = result.winner === 'octocode' ? '🔵' :
                         result.winner === 'context7' ? '🟢' :
                         result.winner === 'none' ? '⚪' : '🟡';
      console.log(`  ${name}${octo}${ctx7}${none}    ${winnerIcon} ${result.winner}`);
    }
  }

  if (numRuns > 1) {
    console.log('\n* = statistically significant (non-overlapping 95% CIs)');
  }

  // Aggregate stats
  const allScores = {
    octocode: allResults.map(r => r.stats.octocode?.mean || 0),
    context7: allResults.map(r => r.stats.context7?.mean || 0),
    none: allResults.map(r => r.stats.none?.mean || 0),
  };

  const avgStats = {
    octocode: calculateStats(allScores.octocode),
    context7: calculateStats(allScores.context7),
    none: calculateStats(allScores.none),
  };

  const wins = { octocode: 0, context7: 0, none: 0, tie: 0 };
  let significantWins = { octocode: 0, context7: 0, none: 0 };

  for (const result of allResults) {
    if (result.winner === 'tie') wins.tie++;
    else wins[result.winner as keyof typeof wins]++;

    if (result.significant && result.winner !== 'tie') {
      significantWins[result.winner as keyof typeof significantWins]++;
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('AGGREGATE SCORES:');
  if (numRuns > 1) {
    console.log(`  🔵 Octocode:  ${avgStats.octocode.mean}% ± ${avgStats.octocode.stdDev}% (95% CI: ${avgStats.octocode.ci95[0]}-${avgStats.octocode.ci95[1]}%)`);
    console.log(`  🟢 Context7:  ${avgStats.context7.mean}% ± ${avgStats.context7.stdDev}% (95% CI: ${avgStats.context7.ci95[0]}-${avgStats.context7.ci95[1]}%)`);
    console.log(`  ⚪ Baseline:  ${avgStats.none.mean}% ± ${avgStats.none.stdDev}% (95% CI: ${avgStats.none.ci95[0]}-${avgStats.none.ci95[1]}%)`);
  } else {
    console.log(`  🔵 Octocode:  ${avgStats.octocode.mean}%`);
    console.log(`  🟢 Context7:  ${avgStats.context7.mean}%`);
    console.log(`  ⚪ Baseline:  ${avgStats.none.mean}%`);
  }

  console.log('\nIMPROVEMENT OVER BASELINE:');
  console.log(`  🔵 Octocode:  +${(avgStats.octocode.mean - avgStats.none.mean).toFixed(1)}%`);
  console.log(`  🟢 Context7:  +${(avgStats.context7.mean - avgStats.none.mean).toFixed(1)}%`);

  console.log('\nWINS:');
  console.log(`  Octocode: ${wins.octocode} | Context7: ${wins.context7} | Baseline: ${wins.none} | Ties: ${wins.tie}`);
  if (numRuns > 1) {
    console.log(`  Significant wins: Octocode: ${significantWins.octocode} | Context7: ${significantWins.context7} | Baseline: ${significantWins.none}`);
  }

  console.log('\n' + '═'.repeat(70));

  // Statistical significance check for overall results
  const octoBetterThanBaseline = numRuns > 1
    ? avgStats.octocode.ci95[0] > avgStats.none.ci95[1]
    : avgStats.octocode.mean > avgStats.none.mean;
  const ctx7BetterThanBaseline = numRuns > 1
    ? avgStats.context7.ci95[0] > avgStats.none.ci95[1]
    : avgStats.context7.mean > avgStats.none.mean;

  if (octoBetterThanBaseline || ctx7BetterThanBaseline) {
    const better = avgStats.octocode.mean > avgStats.context7.mean ? 'Octocode' :
                   avgStats.context7.mean > avgStats.octocode.mean ? 'Context7' : 'Both equally';
    const sigNote = numRuns > 1 ? ' (statistically significant)' : '';
    console.log(`✅ TOOLS HELP: ${better} provides the most value${sigNote}`);
  } else {
    console.log(`❌ TOOLS DON'T HELP: No significant improvement over baseline`);
  }

  // Methodology notes
  console.log('\n' + '─'.repeat(70));
  console.log('METHODOLOGY NOTES:');
  console.log('  - Blind judge: LLM evaluates without seeing exact ground truth');
  console.log('  - Factuality categories: A=correct, B=partial, C=incorrect, D=uncertain, E=irrelevant');
  console.log('  - Provider order randomized per test to avoid ordering effects');
  console.log('  - Same system prompt and maxTurns for all providers');
  if (numRuns > 1) {
    console.log(`  - ${numRuns} runs per test with 95% confidence intervals`);
  } else {
    console.log('  - Run with --runs 3 for statistical significance testing');
  }
}

main().catch(console.error);
