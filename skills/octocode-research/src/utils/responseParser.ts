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
