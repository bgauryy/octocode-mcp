#!/usr/bin/env node
/**
 * Run real comparison evals: Octocode vs Context7 vs Baseline
 *
 * Usage:
 *   npx tsx tests/evals/run-comparison.ts [options]
 *
 * Options:
 *   --verbose       Show detailed output
 *   --limit N       Limit to N test cases
 *   --category X    Filter by category (code_search, file_discovery, etc.)
 *   --save          Save results to baseline
 *   --providers X   Comma-separated providers (octocode,context7,none)
 *   --mode          2way (octocode vs baseline) or 3way (all three)
 *   --challenging   Only run challenging/realistic test cases (post-cutoff, undocumented, etc.)
 *   --difficulty N  Only run test cases with difficulty >= N (1-5 scale)
 */

/* eslint-disable no-console */
import {
  loadManualPrompts,
  loadChallengingPrompts,
  filterByCategory,
  filterByDifficulty,
} from './prompts/index.js';
import {
  runBatchMultiProviderEval,
  formatMultiProviderResults,
  runBatchComparisonEval,
  formatComparisonResults,
  type McpProvider,
} from './utils/sdk-runner.js';
import { saveBaseline } from './utils/baseline.js';
import type { EvalTestCase } from './scorers/types.js';

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const save = args.includes('--save');

  const limitIdx = args.indexOf('--limit');
  const limitArg = limitIdx !== -1 ? args[limitIdx + 1] : undefined;
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  const categoryIdx = args.indexOf('--category');
  const category =
    categoryIdx !== -1 && args[categoryIdx + 1]
      ? args[categoryIdx + 1]
      : undefined;

  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx !== -1 && args[modeIdx + 1] === '3way' ? '3way' : '2way';

  const providersIdx = args.indexOf('--providers');
  const providersArg =
    providersIdx !== -1 && args[providersIdx + 1]
      ? args[providersIdx + 1]
      : undefined;

  const providers: McpProvider[] = providersArg
    ? (providersArg.split(',') as McpProvider[])
    : mode === '3way'
      ? ['octocode', 'context7', 'none']
      : ['octocode', 'none'];

  const challenging = args.includes('--challenging');

  const difficultyIdx = args.indexOf('--difficulty');
  const difficultyArg =
    difficultyIdx !== -1 ? args[difficultyIdx + 1] : undefined;
  const minDifficulty = difficultyArg ? parseInt(difficultyArg, 10) : undefined;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║            OCTOCODE MCP EVALUATION SUITE                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('Loading test cases...');
  let testCases = challenging
    ? await loadChallengingPrompts()
    : await loadManualPrompts();

  if (challenging) {
    console.log(`Loaded ${testCases.length} challenging test cases`);
  }

  // Filter by difficulty if specified
  if (minDifficulty !== undefined) {
    testCases = filterByDifficulty(testCases, minDifficulty);
    console.log(
      `Filtered to ${testCases.length} test cases with difficulty >= ${minDifficulty}`
    );
  }

  // Filter by category if specified
  if (category) {
    testCases = filterByCategory(testCases, [
      category as EvalTestCase['category'],
    ]);
    console.log(`Filtered to ${testCases.length} ${category} test cases`);
  }

  // Apply limit
  if (limit && limit > 0) {
    testCases = testCases.slice(0, limit);
    console.log(`Limited to ${testCases.length} test cases`);
  }

  console.log(`\nConfiguration:`);
  console.log(
    `  Mode: ${mode === '3way' ? '3-way comparison' : '2-way comparison'}`
  );
  console.log(`  Providers: ${providers.join(', ')}`);
  console.log(`  Test cases: ${testCases.length}`);
  console.log(`  Model: claude-sonnet-4-5-20250929`);
  console.log('');
  console.log('Starting evaluation...');
  console.log('(Each prompt will be run with each provider sequentially)\n');

  const startTime = Date.now();

  if (mode === '3way' || providers.length > 2) {
    // Multi-provider comparison
    const { results, summary } = await runBatchMultiProviderEval(
      testCases,
      providers,
      {
        verbose,
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 10,
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(formatMultiProviderResults(results, summary));

    // Additional latency breakdown
    console.log('\n📊 LATENCY BREAKDOWN');
    console.log('─────────────────────────────────────────');
    for (const provider of providers) {
      if (summary.byProvider[provider]) {
        const avg = summary.byProvider[provider].avgLatency;
        const min = Math.min(
          ...results.map(r => r.results[provider]?.latencyMs ?? Infinity)
        );
        const max = Math.max(
          ...results.map(r => r.results[provider]?.latencyMs ?? 0)
        );
        console.log(
          `  ${provider.padEnd(10)} avg: ${Math.round(avg)}ms  min: ${Math.round(min)}ms  max: ${Math.round(max)}ms`
        );
      }
    }

    console.log(`\nCompleted in ${duration}s`);

    if (save) {
      const withResults = results
        .filter(r => r.results.octocode)
        .map(r => r.results.octocode.evalResult);
      const path = await saveBaseline(
        'octocode-3way-comparison',
        withResults,
        `3-way comparison eval - ${testCases.length} test cases`
      );
      console.log(`\nResults saved to: ${path}`);
    }

    // Exit status based on Octocode performance
    if (
      summary.avgDeltas.octocodeVsBaseline < 0 &&
      summary.avgDeltas.octocodeVsContext7 < 0
    ) {
      console.log(
        '\n⚠️  Warning: Octocode performed worse than both baseline and Context7'
      );
      process.exit(1);
    }
  } else {
    // Legacy 2-way comparison
    const { results, summary } = await runBatchComparisonEval(testCases, {
      verbose,
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 10,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(formatComparisonResults(results, summary));
    console.log(`\nCompleted in ${duration}s`);

    if (save) {
      const withResults = results.map(r => r.withOctocode);
      const path = await saveBaseline(
        'octocode-comparison',
        withResults,
        `Real comparison eval - ${testCases.length} test cases`
      );
      console.log(`\nResults saved to: ${path}`);
    }

    if (summary.avgDelta < 0) {
      console.log('\n⚠️  Warning: Octocode performed worse than baseline');
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
