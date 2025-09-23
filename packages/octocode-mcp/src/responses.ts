import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { maskSensitiveData } from './security/mask';
import { ContentSanitizer } from './security/contentSanitizer';
import { isBetaEnabled } from './serverConfig';
import { jsonToYamlString } from 'octocode-utils';

/**
 * Standardized response format for all tool responses
 */
export interface ToolResponse {
  /** Primary data payload (GitHub API responses, packages, file contents, etc.) */
  data: unknown;

  /** Additional context (total results, error details, research goals) */
  meta: {
    [key: string]: unknown;
  };

  /** Helpful hints for AI assistants (recovery tips, usage guidance) */
  hints: string[];
}

/**
 * Simplified result creation with standardized format
 */
export function createResult(options: {
  data?: unknown;
  error?: string | Error;
  isError?: boolean;
  hints?: string[];
  meta?: {
    [key: string]: unknown;
  };
}): CallToolResult {
  const { data, error, isError = false, hints = [], meta = {} } = options;

  // Handle error parameter
  let finalData = data;
  let finalIsError = isError;
  let finalMeta = { ...meta };

  if (error) {
    finalIsError = true;
    const errorMessage = error instanceof Error ? error.message : error;

    // If data is provided, keep it but add error to meta
    if (data !== undefined) {
      finalMeta = { ...meta, error: errorMessage };
    } else {
      // If no data provided, set data to null and put error in meta
      finalData = null;
      finalMeta = { ...meta, error: errorMessage };
    }
  }

  // Special case: if isError is true but no error parameter, set meta.error to true
  if (finalIsError && !error) {
    finalMeta = { ...finalMeta, error: true };
  }

  const response: ToolResponse = {
    data: finalData || null,
    meta: finalMeta,
    hints,
  };

  return {
    content: [{ type: 'text', text: createResponseFormat(response) }],
    isError: finalIsError,
  };
}

/**
 * Creates the final response format for tool responses with security processing.
 *
 * This function performs comprehensive processing on structured tool responses:
 * 1. Optionally converts to YAML format if beta features are enabled
 * 2. Serializes structured data to JSON string format
 * 3. Sanitizes content to remove malicious patterns and prompt injections
 * 4. Masks sensitive information (API keys, tokens, credentials)
 *
 * @param responseData - The structured tool response data
 * @returns Sanitized and formatted string ready for safe transmission
 *
 * @example
 * ```typescript
 * const responseData: ToolResponse = {
 *   data: { repos: [...] },
 *   meta: { total: 42 },
 *   hints: ["Try narrowing your search"]
 * };
 * const formatted = createResponseFormat(responseData);
 * ```
 *
 * @security
 * - Removes potential prompt injection attacks
 * - Masks sensitive credentials and tokens
 * - Handles unserializable data gracefully
 * - Preserves structured data format for AI parsing
 */
function createResponseFormat(responseData: ToolResponse): string {
  let text: string;
  let processedData: ToolResponse | string = responseData;

  // Convert to YAML if beta features are enabled (with safe fallback)
  try {
    if (isBetaEnabled()) {
      processedData = jsonToYamlString(responseData);
    }
  } catch {
    // If serverConfig is not initialized, just use JSON format
    // This ensures tests and other scenarios work without full server initialization
  }

  try {
    text =
      typeof processedData === 'string'
        ? processedData
        : JSON.stringify(processedData, null, 2);
  } catch (e) {
    text = '[Unserializable data]';
  }

  // First, sanitize for malicious content and prompt injection
  const sanitizationResult = ContentSanitizer.sanitizeContent(text);

  // Then mask sensitive data
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
