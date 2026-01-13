/**
 * Octocode Eval Suite
 *
 * Evaluates Octocode MCP research quality across 5 dimensions:
 * - Accuracy: Correctness of results
 * - Completeness: Coverage of expected information
 * - Latency: Response time performance
 * - Tool Selection: Correct tool choices
 * - Reasoning: LLM judge on research logic
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadManualPrompts } from './prompts/index.js';
import { createDefaultScorers } from './scorers/index.js';
import {
  runSingleEval,
  compareResults,
  generateReport,
  formatResultsTable,
  createDefaultConfig,
} from './utils/eval-runner.js';
import {
  saveBaseline,
  loadLatestBaseline,
  compareToBaseline,
} from './utils/baseline.js';
import type {
  EvalTestCase,
  EvalResult,
  ToolResponse,
} from './scorers/types.js';

/* eslint-disable no-console */
const ENABLE_LLM_JUDGE = process.env.OPENAI_API_KEY !== undefined;
const SAVE_BASELINE = process.env.SAVE_BASELINE === 'true';
const COMPARE_BASELINE = process.env.COMPARE_BASELINE === 'true';

describe('Octocode Eval Suite', () => {
  let testCases: EvalTestCase[];
  let scorers: ReturnType<typeof createDefaultScorers>;
  const results: EvalResult[] = [];

  beforeAll(async () => {
    testCases = await loadManualPrompts();
    scorers = createDefaultScorers();

    if (!ENABLE_LLM_JUDGE) {
      console.warn('OPENAI_API_KEY not set - LLM judge scorer will return 0');
    }
  });

  afterAll(async () => {
    if (results.length > 0) {
      console.log('\n' + formatResultsTable(results));

      if (SAVE_BASELINE) {
        const path = await saveBaseline(
          'octocode-eval',
          results,
          'Automated eval run'
        );
        console.log(`\nBaseline saved to: ${path}`);
      }

      if (COMPARE_BASELINE) {
        const baseline = await loadLatestBaseline('octocode-eval');
        if (baseline) {
          const comparison = compareToBaseline(results, baseline.results);
          console.log(
            `\nComparison to baseline (${baseline.metadata.createdAt}):`
          );
          console.log(`  Improved: ${comparison.improved}`);
          console.log(`  Degraded: ${comparison.degraded}`);
          console.log(`  Unchanged: ${comparison.unchanged}`);
          console.log(
            `  Average Delta: ${(comparison.averageDelta * 100).toFixed(2)}%`
          );
        }
      }
    }
  });

  describe('Test Case Execution', () => {
    it('should run all test cases', async () => {
      expect(testCases).toBeDefined();
      expect(testCases.length).toBeGreaterThan(0);

      for (const testCase of testCases) {
        const mockResponses = createMockResponses(testCase);
        const toolsCalled = testCase.expected.expectedTools ?? [];

        const startTime = Date.now();
        const latency = getLatencyForCategory(testCase.category);

        const result = await runSingleEval(
          testCase,
          mockResponses,
          toolsCalled,
          scorers,
          startTime,
          startTime + latency
        );

        results.push(result);

        // Basic assertions for each test case
        expect(result.overall).toBeGreaterThanOrEqual(0);
        expect(result.overall).toBeLessThanOrEqual(1);
        expect(result.testCase).toBe(testCase.name);
      }
    });
  });

  describe('Category-Specific Tests', () => {
    it('should handle code_search scenarios', async () => {
      const codeSearchCases = testCases.filter(
        tc => tc.category === 'code_search'
      );

      expect(codeSearchCases.length).toBeGreaterThan(0);

      for (const testCase of codeSearchCases) {
        const result = results.find(r => r.testCase === testCase.name);
        if (result) {
          expect(result.scores.accuracy).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should handle file_discovery scenarios', async () => {
      const fileCases = testCases.filter(
        tc => tc.category === 'file_discovery'
      );

      expect(fileCases.length).toBeGreaterThan(0);
    });

    it('should handle symbol_lookup scenarios', async () => {
      const symbolCases = testCases.filter(
        tc => tc.category === 'symbol_lookup'
      );

      expect(symbolCases.length).toBeGreaterThan(0);
    });

    it('should handle package_search scenarios', async () => {
      const packageCases = testCases.filter(
        tc => tc.category === 'package_search'
      );

      expect(packageCases.length).toBeGreaterThan(0);
    });

    it('should handle pr_archaeology scenarios', async () => {
      const prCases = testCases.filter(tc => tc.category === 'pr_archaeology');

      expect(prCases.length).toBeGreaterThan(0);
    });

    it('should handle error_handling scenarios', async () => {
      const errorCases = testCases.filter(
        tc => tc.category === 'error_handling'
      );

      expect(errorCases.length).toBeGreaterThan(0);
    });
  });

  describe('Comparison Mode', () => {
    it('should compare with vs without Octocode results', async () => {
      const testCase = testCases[0];
      if (!testCase) return;

      const withOctocodeResponses = createMockResponses(testCase);
      const withoutOctocodeResponses = createMockEmptyResponses();

      const startTime = Date.now();

      const withResult = await runSingleEval(
        testCase,
        withOctocodeResponses,
        testCase.expected.expectedTools ?? [],
        scorers,
        startTime,
        startTime + 1000
      );

      const withoutResult = await runSingleEval(
        testCase,
        withoutOctocodeResponses,
        [],
        scorers,
        startTime,
        startTime + 500
      );

      const comparison = compareResults(withResult, withoutResult);

      expect(comparison.testCase).toBe(testCase.name);
      expect(comparison.delta.overall).toBeDefined();
    });
  });

  describe('Report Generation', () => {
    it('should generate a valid report', async () => {
      if (results.length === 0) {
        return;
      }

      const config = createDefaultConfig('Test Run');
      const report = generateReport(config, results);

      expect(report.version).toBe('1.0.0');
      expect(report.summary.totalTests).toBe(results.length);
      expect(report.summary.averageScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.averageScore).toBeLessThanOrEqual(1);
    });
  });
});

function getLatencyForCategory(category: EvalTestCase['category']): number {
  const latencies: Record<EvalTestCase['category'], number> = {
    code_search: 1500,
    file_discovery: 800,
    symbol_lookup: 500,
    package_search: 300,
    pr_archaeology: 2000,
    error_handling: 100,
  };
  return latencies[category] ?? 1000;
}

function createMockResponses(testCase: EvalTestCase): ToolResponse[] {
  const responses: ToolResponse[] = [];
  const expected = testCase.expected;

  if (expected.status === 'hasResults') {
    const resultCount = expected.minResults ?? 3;

    for (let i = 0; i < resultCount; i++) {
      const content: string[] = [];

      if (expected.mustContain) {
        content.push(...expected.mustContain.map(term => `Found: ${term}`));
      }

      if (expected.expectedFiles) {
        content.push(...expected.expectedFiles);
      }

      responses.push({
        status: 'hasResults',
        resultCount,
        content: content.length > 0 ? content.join('\n') : `Result ${i + 1}`,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: resultCount,
        },
      });
    }
  } else if (expected.status === 'empty') {
    responses.push({
      status: 'empty',
      resultCount: 0,
      content: 'No results found',
    });
  } else if (expected.status === 'error') {
    responses.push({
      status: 'error',
      resultCount: 0,
      content: 'Error: Resource not found',
      error: 'NOT_FOUND: The requested resource could not be found',
      errorCode: 'NOT_FOUND',
    });
  }

  return responses.length > 0
    ? responses
    : [
        {
          status: 'hasResults',
          resultCount: 1,
          content: 'Default response',
        },
      ];
}

function createMockEmptyResponses(): ToolResponse[] {
  return [
    {
      status: 'empty',
      resultCount: 0,
      content: 'No Octocode tools available',
    },
  ];
}
