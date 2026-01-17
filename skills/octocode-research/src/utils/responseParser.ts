/**
 * Parse MCP tool responses to extract structured data
 *
 * MCP tools return responses in this format:
 * {
 *   content: [{ type: 'text', text: yamlString }],
 *   structuredContent?: object,  // Not always present
 *   isError: boolean
 * }
 *
 * The YAML contains:
 * - instructions: string
 * - results: [{ id, status, data, mainResearchGoal, researchGoal, reasoning }]
 * - hasResultsStatusHints / emptyStatusHints / errorStatusHints: string[]
 *
 * This utility extracts data AND preserves the valuable MCP hints.
 */

import yaml from 'js-yaml';

interface McpToolResponse {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Research context from the MCP response
 */
export interface ResearchContext {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Single result item from bulk response
 */
export interface BulkResultItem {
  id: number;
  status: 'hasResults' | 'empty' | 'error';
  data: Record<string, unknown>;
  research: ResearchContext;
}

/**
 * Parsed response with data, hints, and research context
 */
export interface ParsedResponse {
  data: Record<string, unknown>;
  isError: boolean;
  /** MCP workflow hints - critical for agent guidance */
  hints: string[];
  /** Research context preserved from the query */
  research: ResearchContext;
  /** Raw status from MCP (hasResults, empty, error) */
  status: 'hasResults' | 'empty' | 'error' | 'unknown';
}

/**
 * Parsed bulk response with all results
 */
export interface ParsedBulkResponse {
  /** All results from bulk query */
  results: BulkResultItem[];
  /** Categorized hints by status */
  hints: {
    hasResults: string[];
    empty: string[];
    error: string[];
  };
  /** Bulk operation instructions */
  instructions: string;
  /** True if all queries failed */
  isError: boolean;
  /** Count of results by status */
  counts: {
    total: number;
    hasResults: number;
    empty: number;
    error: number;
  };
}

/**
 * Extract structured data from an MCP tool response
 *
 * Priority:
 * 1. Use structuredContent if available (direct object access)
 * 2. Parse YAML from content[0].text and extract results[0].data
 *
 * Also extracts:
 * - MCP hints (hasResultsStatusHints, emptyStatusHints, errorStatusHints)
 * - Research context (mainResearchGoal, researchGoal, reasoning)
 */
export function parseToolResponse(response: McpToolResponse): ParsedResponse {
  const emptyResult: ParsedResponse = {
    data: {},
    isError: true,
    hints: [],
    research: {},
    status: 'unknown',
  };

  // Option 1: structuredContent is available (preferred for data, but no hints)
  if (response.structuredContent && typeof response.structuredContent === 'object') {
    return {
      data: response.structuredContent,
      isError: Boolean(response.isError),
      hints: [], // structuredContent doesn't include hints
      research: {},
      status: 'unknown',
    };
  }

  // Option 2: Parse YAML from content text (includes hints!)
  if (response.content && response.content[0]?.text) {
    try {
      const parsed = yaml.load(response.content[0].text) as Record<string, unknown>;

      // Extract hints based on status
      let hints: string[] = [];
      if (Array.isArray(parsed.hasResultsStatusHints)) {
        hints = parsed.hasResultsStatusHints as string[];
      } else if (Array.isArray(parsed.emptyStatusHints)) {
        hints = parsed.emptyStatusHints as string[];
      } else if (Array.isArray(parsed.errorStatusHints)) {
        hints = parsed.errorStatusHints as string[];
      }

      // Extract data from results[0].data (bulk response format)
      if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
        const firstResult = parsed.results[0] as Record<string, unknown>;
        const resultStatus = String(firstResult.status || 'unknown');

        // Extract research context
        const research: ResearchContext = {
          mainResearchGoal: typeof firstResult.mainResearchGoal === 'string'
            ? firstResult.mainResearchGoal : undefined,
          researchGoal: typeof firstResult.researchGoal === 'string'
            ? firstResult.researchGoal : undefined,
          reasoning: typeof firstResult.reasoning === 'string'
            ? firstResult.reasoning : undefined,
        };

        if (firstResult.data && typeof firstResult.data === 'object') {
          return {
            data: firstResult.data as Record<string, unknown>,
            isError: resultStatus === 'error',
            hints,
            research,
            status: resultStatus as ParsedResponse['status'],
          };
        }
      }

      // Fallback: return parsed object directly
      return {
        data: parsed || {},
        isError: Boolean(response.isError),
        hints,
        research: {},
        status: 'unknown',
      };
    } catch {
      // YAML parsing failed, return empty
      return emptyResult;
    }
  }

  // No data found
  return emptyResult;
}

/**
 * Convenience function to get data field with type safety
 */
export function getDataField<T>(
  response: McpToolResponse,
  field: string,
  defaultValue: T
): T {
  const { data } = parseToolResponse(response);
  const value = data[field];
  return value !== undefined ? (value as T) : defaultValue;
}

/**
 * Parse ALL results from a bulk MCP tool response.
 * Use this when handling multiple queries to get all results.
 *
 * @param response - Raw MCP tool response
 * @returns ParsedBulkResponse with all results and categorized hints
 */
export function parseToolResponseBulk(response: McpToolResponse): ParsedBulkResponse {
  const emptyResult: ParsedBulkResponse = {
    results: [],
    hints: { hasResults: [], empty: [], error: [] },
    instructions: '',
    isError: true,
    counts: { total: 0, hasResults: 0, empty: 0, error: 0 },
  };

  // Parse YAML from content text
  if (!response.content || !response.content[0]?.text) {
    return emptyResult;
  }

  try {
    const parsed = yaml.load(response.content[0].text) as Record<string, unknown>;

    if (!parsed || !Array.isArray(parsed.results)) {
      return emptyResult;
    }

    // Extract all results
    const results: BulkResultItem[] = [];
    let hasResultsCount = 0;
    let emptyCount = 0;
    let errorCount = 0;

    for (const result of parsed.results) {
      if (!result || typeof result !== 'object') continue;

      const r = result as Record<string, unknown>;
      const status = String(r.status || 'unknown') as BulkResultItem['status'];

      if (status === 'hasResults') hasResultsCount++;
      else if (status === 'empty') emptyCount++;
      else if (status === 'error') errorCount++;

      results.push({
        id: typeof r.id === 'number' ? r.id : results.length + 1,
        status,
        data: (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>,
        research: {
          mainResearchGoal: typeof r.mainResearchGoal === 'string' ? r.mainResearchGoal : undefined,
          researchGoal: typeof r.researchGoal === 'string' ? r.researchGoal : undefined,
          reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
        },
      });
    }

    // Extract categorized hints
    const hints = {
      hasResults: Array.isArray(parsed.hasResultsStatusHints)
        ? (parsed.hasResultsStatusHints as string[])
        : [],
      empty: Array.isArray(parsed.emptyStatusHints)
        ? (parsed.emptyStatusHints as string[])
        : [],
      error: Array.isArray(parsed.errorStatusHints)
        ? (parsed.errorStatusHints as string[])
        : [],
    };

    return {
      results,
      hints,
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
      isError: errorCount === results.length && results.length > 0,
      counts: {
        total: results.length,
        hasResults: hasResultsCount,
        empty: emptyCount,
        error: errorCount,
      },
    };
  } catch {
    return emptyResult;
  }
}
