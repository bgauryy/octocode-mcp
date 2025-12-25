/**
 * Response formatting utilities for local file tools
 *
 * This module provides response formatting following the octocode-mcp pattern
 * but adapted for local file operations (no content sanitization by default).
 *
 * @module responses
 */

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { jsonToYamlString } from 'octocode-utils';
import { RESPONSE_KEY_PRIORITY } from '../scheme/responsePriority.js';

/**
 * Tool response structure for bulk operations
 */
export interface ToolResponse {
  instructions?: string;
  results?: unknown[];
  data?: unknown;
  summary?: {
    total: number;
    hasResults: number;
    empty: number;
    errors: number;
  };
  hasResultsStatusHints?: string[];
  emptyStatusHints?: string[];
  errorStatusHints?: string[];
  [key: string]: unknown;
}

/**
 * Creates the final response format for tool responses.
 *
 * This function performs processing on structured tool responses:
 * 1. Recursively cleans the data by removing empty objects, null, undefined, and NaN values
 * 2. Converts to YAML format using octocode-utils for better LLM readability
 * 3. Orders keys by priority for optimal structure
 *
 * Note: Unlike octocode-mcp, this does NOT perform content sanitization or
 * sensitive data masking by default, as we're operating on the same system
 * with the user's own files. Security focus is on command injection prevention.
 *
 * @param responseData - The structured tool response data
 * @param keysPriority - Optional array of keys to prioritize in YAML output ordering
 * @returns Formatted YAML string ready for transmission
 *
 * @example
 * ```typescript
 * const responseData: ToolResponse = {
 *   instructions: "Bulk response...",
 *   results: [...],
 *   hasResultsStatusHints: [...]
 * };
 * const formatted = createResponseFormat(responseData, ['instructions', 'results']);
 * ```
 */
export function createResponseFormat(
  responseData: ToolResponse,
  keysPriority?: string[]
): string {
  const cleanedData = cleanJsonObject(responseData) as ToolResponse;

  return jsonToYamlString(cleanedData, {
    keysPriority: keysPriority || RESPONSE_KEY_PRIORITY,
  });
}

/**
 * Simplified result creation with standardized format
 *
 * @param options - Result options
 * @param options.data - Response data
 * @param options.instructions - Optional processing instructions
 * @param options.isError - Whether this is an error result
 * @returns Formatted CallToolResult
 */
export function createResult(options: {
  data: unknown;
  instructions?: string;
  isError?: boolean;
}): CallToolResult {
  const { data, instructions, isError } = options;
  const response: ToolResponse = {
    data,
    instructions,
  };

  return {
    content: [{ type: 'text', text: createResponseFormat(response) }],
    isError: Boolean(isError),
  };
}

/**
 * Recursively clean JSON object by removing empty objects, empty arrays,
 * null, undefined, and NaN values.
 *
 * This ensures responses don't contain unnecessary empty data structures
 * that add noise for LLMs.
 *
 * @param obj - Object to clean
 * @returns Cleaned object or undefined if empty
 */
function cleanJsonObject(obj: unknown): unknown {
  if (obj === null || obj === undefined || Number.isNaN(obj)) {
    return undefined;
  }

  if (Array.isArray(obj)) {
    const cleaned = obj.map(cleanJsonObject).filter(item => item !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    let hasValidProperties = false;

    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = cleanJsonObject(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
        hasValidProperties = true;
      }
    }

    return hasValidProperties ? cleaned : undefined;
  }

  return obj;
}
