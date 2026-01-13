#!/usr/bin/env node
/**
 * Knowledge Gap Eval - Tests if tools help AI answer questions it can't from training
 *
 * Scoring:
 * 1. Exact Match (40%): Response must contain exact strings from ground truth
 * 2. LLM Judge (60%): Claude verifies if the answer is factually correct
 *
 * Usage:
 *   npx tsx tests/evals/run-knowledge-eval.ts [options]
 */

/* eslint-disable no-console */
import { query } from '@anthropic-ai/claude-agent-sdk';

interface KnowledgeTestCase {
  name: string;
  description: string;
  prompt: string;
  difficulty: number;
  groundTruth: {
    exactMatch: string[];      // Must contain these exact strings
    validationQuery: string;   // The correct answer for LLM judge
  };
  tags: string[];
}

interface ProviderResult {
  provider: string;
  response: string;
  latencyMs: number;
  exactMatchScore: number;    // 0-100
  llmJudgeScore: number;      // 0-100
  score: number;              // Combined score
  exactMatches: string[];
  exactMisses: string[];
  llmJudgeReason: string;
}

interface TestResult {
  testCase: string;
  difficulty: number;
  results: Record<string, ProviderResult>;
  winner: string;
}

const PROVIDERS = {
  octocode: {
    servers: {
      octocode: { command: 'npx', args: ['-y', 'octocode-mcp@latest'] }
    },
    systemPrompt: `You are a coding assistant with Octocode tools. Use them to search GitHub for accurate answers. Be specific with exact values.`
  },
  context7: {
    servers: {
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }
    },
    systemPrompt: `You are a coding assistant with Context7 tools. Use them to search documentation for accurate answers. Be specific with exact values.`
  },
  none: {
    servers: {},
    systemPrompt: `You are a coding assistant. Answer using your training knowledge. Be specific. If unsure about exact values, say "I don't know the exact value".`
  }
};

const LLM_JUDGE_PROMPT = `You are evaluating if an AI response correctly answers a technical question.

QUESTION: {question}

CORRECT ANSWER (ground truth): {groundTruth}

AI RESPONSE TO EVALUATE:
{response}

Score the response:
- 100: Correct - contains the exact correct information
- 50: Partially correct - has some right info but missing key details or has errors
- 0: Incorrect - wrong answer, guessed wrong values, or admitted not knowing

Respond with ONLY a JSON object:
{"score": <number>, "reason": "<brief explanation>"}`;

async function runWithProvider(
  prompt: string,
  providerName: string,
  verbose: boolean
): Promise<{ response: string; latencyMs: number }> {
  const provider = PROVIDERS[providerName as keyof typeof PROVIDERS];
  const startTime = Date.now();
  let response = '';

  const fullPrompt = `${provider.systemPrompt}\n\nQuestion: ${prompt}`;

  try {
    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: providerName === 'none' ? 1 : 8,
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

async function llmJudge(
  question: string,
  groundTruth: string,
  response: string
): Promise<{ score: number; reason: string }> {
  const prompt = LLM_JUDGE_PROMPT
    .replace('{question}', question)
    .replace('{groundTruth}', groundTruth)
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

    // Extract JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { score: parsed.score || 0, reason: parsed.reason || 'No reason' };
    }
  } catch (error) {
    console.error('  LLM Judge error:', error);
  }

  return { score: 0, reason: 'Failed to judge' };
}

function scoreExactMatch(response: string, exactMatch: string[]): {
  score: number;
  matches: string[];
  misses: string[];
} {
  const matches: string[] = [];
  const misses: string[] = [];

  for (const exact of exactMatch) {
    // Case-sensitive exact match for specific values
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

async function scoreResponse(
  response: string,
  question: string,
  groundTruth: KnowledgeTestCase['groundTruth'],
  verbose: boolean
): Promise<{
  exactMatchScore: number;
  llmJudgeScore: number;
  score: number;
  exactMatches: string[];
  exactMisses: string[];
  llmJudgeReason: string;
}> {
  // Exact match scoring (40% weight)
  const exact = scoreExactMatch(response, groundTruth.exactMatch);

  // LLM Judge scoring (60% weight)
  const judge = await llmJudge(question, groundTruth.validationQuery, response);

  if (verbose) {
    console.log(`      Exact: ${exact.score}% | Judge: ${judge.score}% (${judge.reason})`);
  }

  // Combined score: 40% exact + 60% judge
  const combinedScore = Math.round(exact.score * 0.4 + judge.score * 0.6);

  return {
    exactMatchScore: exact.score,
    llmJudgeScore: judge.score,
    score: combinedScore,
    exactMatches: exact.matches,
    exactMisses: exact.misses,
    llmJudgeReason: judge.reason,
  };
}

async function runTest(
  testCase: KnowledgeTestCase,
  verbose: boolean
): Promise<TestResult> {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`Question: ${testCase.prompt.slice(0, 60)}...`);
  console.log(`Exact match required: ${testCase.groundTruth.exactMatch.join(', ')}`);

  const results: Record<string, ProviderResult> = {};

  for (const providerName of ['octocode', 'context7', 'none']) {
    console.log(`\n  Running with ${providerName}...`);

    const { response, latencyMs } = await runWithProvider(testCase.prompt, providerName, verbose);
    const scores = await scoreResponse(response, testCase.prompt, testCase.groundTruth, verbose);

    results[providerName] = {
      provider: providerName,
      response,
      latencyMs,
      ...scores
    };

    console.log(`  [${providerName}] Score: ${scores.score}% (exact: ${scores.exactMatchScore}%, judge: ${scores.llmJudgeScore}%)`);
    console.log(`  [${providerName}] Latency: ${(latencyMs / 1000).toFixed(1)}s`);
    if (scores.exactMisses.length > 0) {
      console.log(`  [${providerName}] Missing: ${scores.exactMisses.join(', ')}`);
    }
  }

  // Determine winner
  const scores = Object.entries(results).map(([name, r]) => ({ name, score: r.score }));
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0].score > scores[1].score ? scores[0].name :
                 scores[0].score === scores[1].score ? 'tie' : scores[0].name;

  return { testCase: testCase.name, difficulty: testCase.difficulty, results, winner };
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              KNOWLEDGE GAP EVALUATION v2                             ║');
  console.log('║  Scoring: 40% Exact Match + 60% LLM Judge                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

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
  console.log('Scoring: 40% exact string match + 60% LLM judge verification\n');

  const allResults: TestResult[] = [];

  for (const testCase of testCases) {
    const result = await runTest(testCase, verbose);
    allResults.push(result);
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('                           RESULTS SUMMARY');
  console.log('═'.repeat(70));

  console.log('\nPer-test scores:');
  console.log('─'.repeat(70));
  console.log('Test Case'.padEnd(30) + 'Octocode  Context7  Baseline  Winner');
  console.log('─'.repeat(70));

  for (const result of allResults) {
    const name = result.testCase.slice(0, 28).padEnd(30);
    const octo = `${result.results.octocode?.score || 0}%`.padStart(6);
    const ctx7 = `${result.results.context7?.score || 0}%`.padStart(8);
    const none = `${result.results.none?.score || 0}%`.padStart(8);
    const winner = result.winner === 'octocode' ? '🔵' :
                   result.winner === 'context7' ? '🟢' :
                   result.winner === 'none' ? '⚪' : '🟡';
    console.log(`${name}${octo}${ctx7}${none}    ${winner} ${result.winner}`);
  }

  // Aggregate stats
  const avgScores = { octocode: 0, context7: 0, none: 0 };
  const avgLatency = { octocode: 0, context7: 0, none: 0 };
  const wins = { octocode: 0, context7: 0, none: 0, tie: 0 };

  for (const result of allResults) {
    avgScores.octocode += result.results.octocode?.score || 0;
    avgScores.context7 += result.results.context7?.score || 0;
    avgScores.none += result.results.none?.score || 0;
    avgLatency.octocode += result.results.octocode?.latencyMs || 0;
    avgLatency.context7 += result.results.context7?.latencyMs || 0;
    avgLatency.none += result.results.none?.latencyMs || 0;
    if (result.winner === 'tie') wins.tie++;
    else wins[result.winner as keyof typeof wins]++;
  }

  const n = allResults.length;
  avgScores.octocode = Math.round(avgScores.octocode / n);
  avgScores.context7 = Math.round(avgScores.context7 / n);
  avgScores.none = Math.round(avgScores.none / n);
  avgLatency.octocode = Math.round(avgLatency.octocode / n / 1000 * 10) / 10;
  avgLatency.context7 = Math.round(avgLatency.context7 / n / 1000 * 10) / 10;
  avgLatency.none = Math.round(avgLatency.none / n / 1000 * 10) / 10;

  console.log('\n' + '─'.repeat(70));
  console.log('AVERAGE SCORES (40% exact + 60% LLM judge):');
  console.log(`  🔵 Octocode:  ${avgScores.octocode}%`);
  console.log(`  🟢 Context7:  ${avgScores.context7}%`);
  console.log(`  ⚪ Baseline:  ${avgScores.none}%`);

  console.log('\nAVERAGE LATENCY:');
  console.log(`  🔵 Octocode:  ${avgLatency.octocode}s`);
  console.log(`  🟢 Context7:  ${avgLatency.context7}s`);
  console.log(`  ⚪ Baseline:  ${avgLatency.none}s`);

  console.log('\nIMPROVEMENT OVER BASELINE:');
  console.log(`  🔵 Octocode:  +${avgScores.octocode - avgScores.none}% accuracy, +${(avgLatency.octocode - avgLatency.none).toFixed(1)}s latency`);
  console.log(`  🟢 Context7:  +${avgScores.context7 - avgScores.none}% accuracy, +${(avgLatency.context7 - avgLatency.none).toFixed(1)}s latency`);

  console.log('\nWINS:');
  console.log(`  Octocode: ${wins.octocode} | Context7: ${wins.context7} | Baseline: ${wins.none} | Ties: ${wins.tie}`);

  console.log('\n' + '═'.repeat(70));

  const toolsHelp = avgScores.octocode > avgScores.none || avgScores.context7 > avgScores.none;
  if (toolsHelp) {
    const better = avgScores.octocode > avgScores.context7 ? 'Octocode' :
                   avgScores.context7 > avgScores.octocode ? 'Context7' : 'Both equally';
    console.log(`✅ TOOLS HELP: ${better} provides the most value for knowledge-gap questions`);
  } else {
    console.log(`❌ TOOLS DON'T HELP: Baseline performed as well or better`);
  }
}

main().catch(console.error);
