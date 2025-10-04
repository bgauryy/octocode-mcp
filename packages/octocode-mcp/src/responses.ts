import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { maskSensitiveData } from './security/mask';
import { ContentSanitizer } from './security/contentSanitizer';
import { jsonToYamlString } from 'octocode-utils';

/**
 * Standardized response format for all tool responses
 */
export interface ToolResponse {
  /** Primary data payload (GitHub API responses, packages, file contents, etc.) */
  data: unknown;

  /** Helpful hints for AI assistants (recovery tips, usage guidance) */
  hints: string[];
}

/**
 * Simplified result creation with standardized format
 */
export function createResult(options: {
  data: unknown;
  hints?: string[];
  isError?: boolean;
}): CallToolResult {
  const { data, hints = [], isError } = options;
  const response: ToolResponse = {
    data,
    hints,
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
      'queryId',
      'reasoning',
      'repository',
      'files',
    ],
  });
  //sanitize for malicious content and prompt injection
  const sanitizationResult = ContentSanitizer.sanitizeContent(yamlData);
  //mask sensitive data
  return maskSensitiveData(sanitizationResult.content);
}

/**
 * Convert ISO timestamp to DDMMYYYY format
 */
export function toDDMMYYYY(timestamp: string): string {
  const date = new Date(timestamp);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Convert repository URL to owner/repo format
 */
export function simplifyRepoUrl(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match?.[1] || url;
}

/**
 * Extract first line of commit message
 */
export function getCommitTitle(message: string): string {
  return message.split('\n')[0]?.trim() || '';
}

/**
 * Convert bytes to human readable format
 */
export function humanizeBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round(bytes / Math.pow(k, i))} ${sizes[i]}`;
}

/**
 * Simplify GitHub URL to relative path
 */
export function simplifyGitHubUrl(url: string): string {
  const match = url.match(
    /github\.com\/[^/]+\/[^/]+\/(?:blob|commit)\/[^/]+\/(.+)$/
  );
  return match?.[1] || url;
}

/**
 * Clean and optimize text match context
 */
export function optimizeTextMatch(
  fragment: string,
  maxLength: number = 100
): string {
  // Remove excessive whitespace and normalize
  const cleaned = fragment.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  // Try to cut at word boundary
  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '…';
  }

  return truncated + '…';
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
