#!/usr/bin/env node
/**
 * Run real comparison evals: Octocode vs Context7 vs no external MCP provider.
 *
 * Usage:
 *   npx tsx tests/evals/run-comparison.ts [options]
 *
 * Options:
 *   --verbose       Show detailed output
 *   --list          List the selected test cases and exit
 *   --limit N       Limit to N test cases
 *   --category X    Filter by category (code_search, file_discovery, etc.)
 *   --names X       Comma-separated exact prompt names
 *   --tags X        Comma-separated tags
 *   --save          Save results to a stored baseline artifact
 *   --client X      Runtime client: claude, codex, or cursor
 *   --model X       Override the client-specific model name
 *   --providers X   Comma-separated providers (octocode,context7,none)
 *   --mode          2way (octocode vs none) or 3way (all three)
 *   --challenging   Only run challenging/realistic test cases (post-cutoff, undocumented, etc.)
 *   --difficulty N  Only run test cases with difficulty >= N (1-5 scale)
 */

import {
  loadManualPrompts,
  loadChallengingPrompts,
  filterByCategory,
  filterByDifficulty,
  filterByTags,
} from './prompts/index.js';
import {
  runBatchMultiProviderEval,
  runBatchComparisonEval,
  formatComparisonResults,
  formatMultiProviderResults,
  type EvalClient,
  type McpProvider,
} from './utils/sdk-runner.js';
import { saveBaseline } from './utils/baseline.js';
import type { EvalTestCase } from './scorers/types.js';

function formatSelectedCases(
  testCases: EvalTestCase[],
  options: {
    client: EvalClient;
    mode: '2way' | '3way';
    providers: McpProvider[];
    challenging: boolean;
  }
): string {
  const lines: string[] = [];

  lines.push(`Client: ${options.client}`);
  lines.push(`Mode: ${options.mode}`);
  lines.push(`Providers: ${options.providers.join(', ')}`);
  lines.push(
    `Corpus: ${options.challenging ? 'challenging-only' : 'base + challenging'}`
  );
  lines.push(`Selected cases: ${testCases.length}`);
  lines.push('');

  for (const testCase of testCases) {
    const difficulty =
      typeof testCase.difficulty === 'number'
        ? `d${testCase.difficulty}`
        : 'd-';
    const tags =
      Array.isArray(testCase.tags) && testCase.tags.length > 0
        ? testCase.tags.join(', ')
        : '-';
    lines.push(
      `- ${testCase.name} | ${testCase.category} | ${difficulty} | tags: ${tags}`
    );
    if (testCase.description) {
      lines.push(`  ${testCase.description}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const save = args.includes('--save');
  const listOnly = args.includes('--list');

  const limitIdx = args.indexOf('--limit');
  const limitArg = limitIdx !== -1 ? args[limitIdx + 1] : undefined;
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  const clientIdx = args.indexOf('--client');
  const client =
    clientIdx !== -1 && args[clientIdx + 1]
      ? (args[clientIdx + 1] as EvalClient)
      : 'claude';

  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

  const categoryIdx = args.indexOf('--category');
  const category =
    categoryIdx !== -1 && args[categoryIdx + 1]
      ? args[categoryIdx + 1]
      : undefined;

  const namesIdx = args.indexOf('--names');
  const namesArg =
    namesIdx !== -1 && args[namesIdx + 1] ? args[namesIdx + 1] : undefined;
  const selectedNames = namesArg
    ? new Set(
        namesArg
          .split(',')
          .map(name => name.trim())
          .filter(Boolean)
      )
    : undefined;

  const tagsIdx = args.indexOf('--tags');
  const tagsArg =
    tagsIdx !== -1 && args[tagsIdx + 1] ? args[tagsIdx + 1] : undefined;
  const tags = tagsArg
    ? tagsArg
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
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

  if (client !== 'claude' && providers.includes('context7')) {
    throw new Error('provider=context7 is only supported with --client claude');
  }

  const challenging = args.includes('--challenging');

  const difficultyIdx = args.indexOf('--difficulty');
  const difficultyArg =
    difficultyIdx !== -1 ? args[difficultyIdx + 1] : undefined;
  const minDifficulty = difficultyArg ? parseInt(difficultyArg, 10) : undefined;

  let testCases = challenging
    ? await loadChallengingPrompts()
    : await loadManualPrompts();

  // Filter by difficulty if specified
  if (minDifficulty !== undefined) {
    testCases = filterByDifficulty(testCases, minDifficulty);
  }

  // Filter by category if specified
  if (category) {
    testCases = filterByCategory(testCases, [
      category as EvalTestCase['category'],
    ]);
  }

  if (selectedNames && selectedNames.size > 0) {
    testCases = testCases.filter(testCase => selectedNames.has(testCase.name));
  }

  if (tags && tags.length > 0) {
    testCases = filterByTags(testCases, tags);
  }

  // Apply limit
  if (limit && limit > 0) {
    testCases = testCases.slice(0, limit);
  }

  if (listOnly) {
    console.log(
      formatSelectedCases(testCases, {
        client,
        mode,
        providers,
        challenging,
      })
    );
    return;
  }

  if (mode === '3way' || providers.length > 2) {
    // Multi-provider comparison
    const { results, summary } = await runBatchMultiProviderEval(
      testCases,
      providers,
      {
        client,
        verbose,
        model,
        maxTurns: 10,
      }
    );

    console.log(`Client: ${client}`);
    console.log(formatMultiProviderResults(results, client, summary));

    if (save) {
      const withResults = results
        .filter(r => r.results.octocode)
        .map(r => r.results.octocode.evalResult);
      await saveBaseline(
        `octocode-3way-comparison-${client}`,
        withResults,
        `3-way comparison eval (${client}) - ${testCases.length} test cases`
      );
    }

    // Exit status based on Octocode performance
    if (
      summary.avgDeltas.octocodeVsBaseline < 0 &&
      summary.avgDeltas.octocodeVsContext7 < 0
    ) {
      process.exit(1);
    }
  } else {
    // Legacy 2-way comparison
    const { results, summary } = await runBatchComparisonEval(testCases, {
      client,
      verbose,
      model,
      maxTurns: 10,
    });

    console.log(`Client: ${client}`);
    console.log(formatComparisonResults(results, client, summary));

    if (save) {
      const withResults = results.map(r => r.withOctocode);
      await saveBaseline(
        `octocode-comparison-${client}`,
        withResults,
        `Real comparison eval (${client}) - ${testCases.length} test cases`
      );
    }

    if (summary.avgDelta < 0) {
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
