/**
 * Hint status types for determining which hints to return
 * - 'hasResults': Tool returned results successfully
 * - 'empty': Tool returned no results (but no error)
 * - 'error': Tool encountered an error
 */
export type HintStatus = 'hasResults' | 'empty' | 'error';

/**
 * Context that tools can provide to generate smarter, context-aware hints.
 * Used by dynamic hint generators to provide intelligent guidance.
 */
export interface HintContext {
  // Size context
  /** File size in KB */
  fileSize?: number;
  /** Result size in characters */
  resultSize?: number;
  /** Estimated token count */
  tokenEstimate?: number;
  /** Number of entries/files in result */
  entryCount?: number;

  // Search context
  /** Number of matches found */
  matchCount?: number;
  /** Number of files containing matches */
  fileCount?: number;
  /** Whether result/file is considered large */
  isLarge?: boolean;

  // Error context
  /** Type of error encountered */
  errorType?: 'size_limit' | 'not_found' | 'permission' | 'pattern_too_broad';
  /** Original error message */
  originalError?: string;

  // Tool-specific context
  /** Whether matchString/pattern was used */
  hasPattern?: boolean;
  /** Whether pagination (charLength) was used */
  hasPagination?: boolean;
  /** Path being searched/accessed */
  path?: string;
  /** Whether owner/repo context was provided (GitHub tools) */
  hasOwnerRepo?: boolean;
  /** GitHub code search match mode */
  match?: 'file' | 'path';
  /** Which search engine was used (local tools) */
  searchEngine?: 'rg' | 'grep';
}

/**
 * Hint generator function signature for dynamic hints.
 * Returns an array that may contain undefined values (filtered out later).
 */
export type HintGenerator = (context: HintContext) => (string | undefined)[];

/**
 * Structure for tool-specific hint generators by status.
 */
export interface ToolHintGenerators {
  hasResults: HintGenerator;
  empty: HintGenerator;
  error: HintGenerator;
}

export interface ToolMetadata {
  name: string;
  description: string;
  schema: Record<string, string>;
  hints: {
    hasResults: readonly string[];
    empty: readonly string[];
    dynamic?: Record<string, string[] | undefined>;
  };
}

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptMetadata {
  name: string;
  description: string;
  content: string;
  args?: PromptArgument[];
}

export interface ToolNames {
  GITHUB_FETCH_CONTENT: 'githubGetFileContent';
  GITHUB_SEARCH_CODE: 'githubSearchCode';
  GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests';
  GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories';
  GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure';
  PACKAGE_SEARCH: 'packageSearch';
  LOCAL_RIPGREP: 'localSearchCode';
  LOCAL_FETCH_CONTENT: 'localGetFileContent';
  LOCAL_FIND_FILES: 'localFindFiles';
  LOCAL_VIEW_STRUCTURE: 'localViewStructure';
}

export interface BaseSchema {
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  bulkQueryTemplate: string;
}

export interface CompleteMetadata {
  instructions: string;
  prompts: Record<string, PromptMetadata>;
  toolNames: ToolNames;
  baseSchema: {
    mainResearchGoal: string;
    researchGoal: string;
    reasoning: string;
    bulkQuery: (toolName: string) => string;
  };
  tools: Record<string, ToolMetadata>;
  baseHints: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
  genericErrorHints: readonly string[];
  bulkOperations?: {
    instructions?: {
      base?: string;
      hasResults?: string;
      empty?: string;
      error?: string;
    };
  };
}

export interface RawCompleteMetadata {
  instructions: string;
  prompts: Record<string, PromptMetadata>;
  toolNames: ToolNames;
  baseSchema: BaseSchema;
  tools: Record<string, ToolMetadata>;
  baseHints: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
  genericErrorHints: readonly string[];
  bulkOperations?: {
    instructions?: {
      base?: string;
      hasResults?: string;
      empty?: string;
      error?: string;
    };
  };
}
