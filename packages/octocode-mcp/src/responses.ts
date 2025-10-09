import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { maskSensitiveData } from './security/mask';
import { ContentSanitizer } from './security/contentSanitizer';
import { jsonToYamlString } from 'octocode-utils';

/**
 * Standardized response format for all tool responses.
 * Supports both single responses (data, instructions) and bulk responses (instructions, results, status-based hints).
 */
export interface ToolResponse {
  /** Primary data payload (GitHub API responses, packages, file contents, etc.) - used in single responses */
  data?: unknown;

  /** Helpful hints for AI assistants (recovery tips, usage guidance) - DEPRECATED: Use instructions instead */
  hints?: string[];

  /** Instructions for processing responses - used in both single and bulk responses */
  instructions?: string;

  /** Results array for bulk operations - replaces data.queries */
  results?: unknown[];

  /** Hints for results that have data in bulk operations */
  hasResultsStatusHints?: string[];

  /** Hints for empty results in bulk operations */
  emptyStatusHints?: string[];

  /** Hints for error results in bulk operations */
  errorStatusHints?: string[];
}

/**
 * Simplified result creation with standardized format
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
 * Creates the final response format for tool responses with security processing.
 *
 * This function performs comprehensive processing on structured tool responses:
 * 1. Recursively cleans the data by removing empty objects, null, undefined, and NaN values
 * 2. Optionally converts to YAML format if beta features are enabled
 * 3. Serializes structured data to JSON string format
 * 4. Sanitizes content to remove malicious patterns and prompt injections
 * 5. Masks sensitive information (API keys, tokens, credentials)
 *
 * @param responseData - The structured tool response data
 * @param keysPriority - Optional array of keys to prioritize in YAML output ordering
 * @returns Sanitized and formatted string ready for safe transmission
 *
 * @example
 * ```typescript
 * const responseData: ToolResponse = {
 *   data: { repos: [...] },
 *   hints: ["Try narrowing your search"]
 * };
 * const formatted = createResponseFormat(responseData, ['queryId', 'reasoning']);
 * ```
 *
 * @security
 * - Removes potential prompt injection attacks
 * - Masks sensitive credentials and tokens
 * - Handles unserializable data gracefully
 * - Preserves structured data format for AI parsing
 */
export function createResponseFormat(
  responseData: ToolResponse,
  keysPriority?: string[]
): string {
  // Clean object
  const cleanedData = cleanJsonObject(responseData) as ToolResponse;
  // Convert to YAML if beta features are enabled (with safe fallback)
  const yamlData = jsonToYamlString(cleanedData, {
    keysPriority: keysPriority || [
      // Single responses: instructions, data
      // Bulk responses: instructions, results, hasResultsStatusHints, emptyStatusHints, errorStatusHints
      'instructions',
      'results',
      'hasResultsStatusHints',
      'emptyStatusHints',
      'errorStatusHints',
      'query',
      'status',
      'data',
      'researchGoal',
      'reasoning',
      'researchSuggestions',
    ],
  });
  //sanitize for malicious content and prompt injection
  const sanitizationResult = ContentSanitizer.sanitizeContent(yamlData);
  //mask sensitive data
  return maskSensitiveData(sanitizationResult.content);
}

/**
 * Recursively clean JSON object by removing empty objects, empty arrays, null, undefined, and NaN values
 * This ensures responses don't contain unnecessary empty data structures
 */
function cleanJsonObject(obj: unknown): unknown {
  if (obj === null || obj === undefined || Number.isNaN(obj)) {
    return undefined;
  }

  if (Array.isArray(obj)) {
    const cleaned = obj.map(cleanJsonObject).filter(item => item !== undefined);
    // Remove empty arrays from response - they add no value
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
