import { CallToolResult } from '@modelcontextprotocol/sdk/types';

/**
 * Standardized result processor for consistent API/CLI handling across all GitHub tools.
 *
 * This utility addresses the inconsistencies in how different tools parse CLI vs API results:
 * - CLI results are wrapped in: { command, result: actualData, timestamp, type, ... }
 * - API results are wrapped in: { data: actualData }
 */

export interface ProcessedResult<T = any> {
  data: T | null;
  error: string | undefined;
  source: 'cli' | 'api';
  rawResult?: any;
}

export interface DualResult<T = any> {
  cli: ProcessedResult<T>;
  api: ProcessedResult<T>;
  bestResult: ProcessedResult<T> | null;
  resultSource: 'cli' | 'api' | 'none';
}

/**
 * Process CLI result with standardized error handling
 */
export async function processCLIResult<T = any>(
  cliResult: PromiseSettledResult<CallToolResult> | CallToolResult | null,
  dataExtractor?: (parsedData: any) => T | Promise<T>
): Promise<ProcessedResult<T>> {
  if (!cliResult) {
    return {
      data: null,
      error: 'No CLI result provided',
      source: 'cli',
    };
  }

  // Handle PromiseSettledResult wrapper
  const actualResult: CallToolResult | null =
    'status' in cliResult
      ? cliResult.status === 'fulfilled'
        ? (cliResult.value as CallToolResult)
        : null
      : cliResult;

  if (!actualResult) {
    const reason =
      'status' in cliResult && cliResult.status === 'rejected'
        ? String(cliResult.reason)
        : 'CLI result is null';
    return {
      data: null,
      error: `CLI execution failed: ${reason}`,
      source: 'cli',
    };
  }

  if (actualResult.isError) {
    return {
      data: null,
      error: actualResult.content[0].text as string,
      source: 'cli',
      rawResult: actualResult,
    };
  }

  try {
    const parsedData = JSON.parse(actualResult.content[0].text as string);

    // CLI results are wrapped in { result: actualData, ... }
    const extractedData = parsedData.result || parsedData;

    // Apply custom data extractor if provided
    const finalData = dataExtractor
      ? await dataExtractor(extractedData)
      : extractedData;

    return {
      data: finalData,
      error: undefined,
      source: 'cli',
      rawResult: parsedData,
    };
  } catch (parseError) {
    return {
      data: null,
      error: `Failed to parse CLI result: ${parseError}`,
      source: 'cli',
      rawResult: actualResult,
    };
  }
}

/**
 * Process API result with standardized error handling
 */
export async function processAPIResult<T = any>(
  apiResult: PromiseSettledResult<CallToolResult> | CallToolResult | null,
  dataExtractor?: (parsedData: any) => T | Promise<T>
): Promise<ProcessedResult<T>> {
  if (!apiResult) {
    return {
      data: null,
      error: 'No API result provided',
      source: 'api',
    };
  }

  // Handle PromiseSettledResult wrapper
  const actualResult: CallToolResult | null =
    'status' in apiResult
      ? apiResult.status === 'fulfilled'
        ? (apiResult.value as CallToolResult)
        : null
      : apiResult;

  if (!actualResult) {
    const reason =
      'status' in apiResult && apiResult.status === 'rejected'
        ? String(apiResult.reason)
        : 'API result is null';
    return {
      data: null,
      error: `API execution failed: ${reason}`,
      source: 'api',
    };
  }

  if (actualResult.isError) {
    try {
      // Try to parse error response for structured error info
      const errorData = JSON.parse(actualResult.content[0].text as string);
      const errorMessage =
        errorData.error ||
        errorData.message ||
        (actualResult.content[0].text as string);
      return {
        data: null,
        error: errorMessage,
        source: 'api',
        rawResult: errorData,
      };
    } catch {
      return {
        data: null,
        error: actualResult.content[0].text as string,
        source: 'api',
        rawResult: actualResult,
      };
    }
  }

  try {
    const parsedData = JSON.parse(actualResult.content[0].text as string);

    // API results are wrapped in { data: actualData } - handle both patterns
    const extractedData = parsedData.data || parsedData;

    // Apply custom data extractor if provided
    const finalData = dataExtractor
      ? await dataExtractor(extractedData)
      : extractedData;

    return {
      data: finalData,
      error: undefined,
      source: 'api',
      rawResult: parsedData,
    };
  } catch (parseError) {
    return {
      data: null,
      error: `Failed to parse API result: ${parseError}`,
      source: 'api',
      rawResult: actualResult,
    };
  }
}

/**
 * Process both CLI and API results and determine the best result to use
 */
export async function processDualResults<T = any>(
  cliResult: PromiseSettledResult<CallToolResult> | CallToolResult | null,
  apiResult: PromiseSettledResult<CallToolResult> | CallToolResult | null,
  options: {
    cliDataExtractor?: (parsedData: any) => T | Promise<T>;
    apiDataExtractor?: (parsedData: any) => T | Promise<T>;
    preferredSource?: 'cli' | 'api';
  } = {}
): Promise<DualResult<T>> {
  const cli = await processCLIResult(cliResult, options.cliDataExtractor);
  const api = await processAPIResult(apiResult, options.apiDataExtractor);

  // Determine best result based on success and preference
  let bestResult: ProcessedResult<T> | null = null;
  let resultSource: 'cli' | 'api' | 'none' = 'none';

  const hasCliData = cli.data !== null && !cli.error;
  const hasApiData = api.data !== null && !api.error;

  if (hasCliData && hasApiData) {
    // Both have results, use preference or default to CLI
    const preferred = options.preferredSource || 'cli';
    bestResult = preferred === 'cli' ? cli : api;
    resultSource = preferred;
  } else if (hasCliData) {
    bestResult = cli;
    resultSource = 'cli';
  } else if (hasApiData) {
    bestResult = api;
    resultSource = 'api';
  }

  return {
    cli,
    api,
    bestResult,
    resultSource,
  };
}

/**
 * Common data extractors for different GitHub API response types
 */
export const dataExtractors = {
  // For search results that have items array
  searchResults: (data: any) => ({
    items: Array.isArray(data.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [],
    total_count: data.total_count || (Array.isArray(data) ? data.length : 0),
    ...data,
  }),

  // For results that have a results array (issues, PRs)
  resultsArray: (data: any) => ({
    results: Array.isArray(data.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [],
    total_count:
      data.total_count ||
      (Array.isArray(data.results)
        ? data.results.length
        : Array.isArray(data)
          ? data.length
          : 0),
    ...data,
  }),

  // For commits that have commits array
  commitsArray: (data: any) => ({
    commits: Array.isArray(data.commits)
      ? data.commits
      : Array.isArray(data)
        ? data
        : [],
    total_count:
      data.total_count ||
      (Array.isArray(data.commits)
        ? data.commits.length
        : Array.isArray(data)
          ? data.length
          : 0),
    ...data,
  }),

  // For repository results
  repositories: (data: any) => ({
    repositories: Array.isArray(data.repositories)
      ? data.repositories
      : Array.isArray(data)
        ? data
        : [],
    total_count:
      data.total_count ||
      (Array.isArray(data.repositories)
        ? data.repositories.length
        : Array.isArray(data)
          ? data.length
          : 0),
    ...data,
  }),

  // For single file content
  fileContent: (data: any) => data,

  // Pass-through for already structured data
  passThrough: (data: any) => data,
};

/**
 * Utility to validate that results have expected structure
 */
export function validateResultStructure<T = any>(
  result: ProcessedResult<T>,
  expectedFields: string[]
): { isValid: boolean; missingFields: string[] } {
  if (!result.data || typeof result.data !== 'object') {
    return { isValid: false, missingFields: expectedFields };
  }

  const missingFields = expectedFields.filter(
    field => !(field in (result.data as Record<string, any>))
  );
  return { isValid: missingFields.length === 0, missingFields };
}
