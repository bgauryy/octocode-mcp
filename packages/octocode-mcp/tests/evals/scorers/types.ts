/**
 * Types for Octocode evaluation framework
 */

// Tool response status from Octocode tools
export type ToolStatus = 'hasResults' | 'empty' | 'error';

export type EvalCategory =
  | 'code_search'
  | 'file_discovery'
  | 'symbol_lookup'
  | 'package_search'
  | 'pr_archaeology'
  | 'error_handling';

export type EvalProvider = 'octocode' | 'context7' | 'none';

// Generic tool response shape
export interface ToolResponse {
  status: ToolStatus;
  resultCount?: number;
  error?: string;
  errorCode?: string;
  hints?: string[];
  files?: unknown[];
  repositories?: unknown[];
  packages?: unknown[];
  locations?: unknown[];
  content?: string;
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches?: number;
    totalFiles?: number;
  };
  [key: string]: unknown;
}

// Expected result definition for a test case
export interface ExpectedResult {
  status?: ToolStatus;
  minResults?: number;
  maxLatencyMs?: number;
  expectedTools?: string[];
  expectedToolsByProvider?: Partial<Record<EvalProvider, string[]>>;
  expectedToolOrder?: boolean;
  mustContain?: string[];
  mustNotContain?: string[];
  expectedFiles?: string[];
  expectedPatterns?: RegExp[];
}

// Ground truth for verified-answer test cases
export interface GroundTruth {
  exactAnswer: string;
  sourceFile: string;
  sourceRepo: string;
  verifiedDate: string;
  validationQuery?: string;
  exactMatch?: string;
}

// Test case definition
export interface EvalTestCase {
  name: string;
  description?: string;
  prompt: string;
  category: EvalCategory;
  expected: ExpectedResult;
  tags?: string[];
  difficulty?: number; // 1-5 scale: how hard without tools
  whyHard?: string; // Explanation of why AI struggles without tools
  groundTruth?: GroundTruth; // Verified answer from source code
}

// Context passed to scorers
export interface EvalContext {
  tools: string[];
  provider?: EvalProvider;
  testCase: EvalTestCase;
  baseline?: EvalResult;
  startTime: number;
  endTime: number;
  finalResponse?: string;
}

// Individual scorer interface
export interface EvalScorer {
  name: string;
  weight: number;
  score(
    output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<number>;
  explain(
    output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<string>;
}

// Result from a single eval run
export interface EvalResult {
  testCase: string;
  category?: EvalCategory | 'general';
  scores: Record<string, number>;
  overall: number;
  explanations: Record<string, string>;
  latencyMs: number;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
  timestamp: string;
  success: boolean;
}

// Comparison between two eval runs
export interface EvalComparison {
  testCase: string;
  withOctocode: EvalResult;
  withoutOctocode: EvalResult;
  delta: {
    overall: number;
    byScorer: Record<string, number>;
    latencyDelta: number;
  };
  improved: boolean;
}

// Full eval report
export interface EvalReport {
  version: string;
  timestamp: string;
  config: EvalConfig;
  results: EvalResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    averageScore: number;
    averageLatency: number;
    byCategory: Record<string, { count: number; avgScore: number }>;
  };
  comparisons?: EvalComparison[];
}

// Eval configuration
export interface EvalConfig {
  name: string;
  description?: string;
  scorers: EvalScorer[];
  thresholds: {
    minOverallScore: number;
    maxLatencyMs: number;
  };
  llmJudge?: {
    enabled: boolean;
    model: string;
    apiKey?: string;
  };
}

// LLM Judge response
export interface LLMJudgeResponse {
  score: number; // 1-5 scale
  reasoning: string;
  confidence: number; // 0-1
  skipped?: boolean;
}

// Scorer options
export interface LatencyScorerOptions {
  excellent: number; // ms threshold for score 1.0
  good: number; // ms threshold for score 0.8
  acceptable: number; // ms threshold for score 0.5
  poor: number; // ms threshold for score 0.2
}

export interface ToolSelectionScorerOptions {
  penalizeExtraTools: boolean;
  penalizeWrongOrder: boolean;
  extraToolPenalty: number; // 0-1
  wrongOrderPenalty: number; // 0-1
}

export interface AccuracyScorerOptions {
  requireAllExpectedFiles: boolean;
  partialMatchScore: number; // score for partial matches
}

export interface CompletenessScorerOptions {
  penalizeTruncated: boolean;
  truncationPenalty: number;
  minResultsWeight: number;
}

export interface ReasoningScorerOptions {
  model: string;
  apiKey?: string;
  systemPrompt?: string;
  timeout: number;
}
