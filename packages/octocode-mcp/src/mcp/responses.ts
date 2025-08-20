import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { maskSensitiveData } from '../security/mask';
import { ContentSanitizer } from '../security/contentSanitizer';

/**
 * Standardized response format for all tool responses
 */
export interface ToolResponse {
  /** Primary data payload (GitHub API responses, packages, file contents, etc.) */
  data: unknown;

  /** Whether the operation failed (excluded from JSON response) */
  isError: boolean;

  /** Helpful hints for AI assistants (recovery tips, usage guidance) */
  hints: string[];

  /** Additional context (total results, error details, research goals) */
  meta: {
    [key: string]: unknown;
  };
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
    isError: finalIsError,
    hints,
    meta: finalMeta,
  };

  // Return response without isError field in the JSON structure
  const responseForJson = {
    data: response.data,
    meta: response.meta,
    hints: response.hints,
  };

  return {
    content: [{ type: 'text', text: wrapResponse(responseForJson) }],
    isError: finalIsError,
  };
}

/**
 * Wraps tool data with a system prompt and escapes/sanitizes untrusted data
 */
function wrapResponse(data: unknown): string {
  let text: string;
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  } catch (e) {
    text = '[Unserializable data]';
  }

  // Check if this is a JSON response (most tool responses are JSON)
  let isJsonResponse = false;
  try {
    JSON.parse(text);
    isJsonResponse = true;
  } catch {
    // Not JSON
  }

  // For JSON responses, be more conservative with sanitization
  // Only apply masking for sensitive data, not full content sanitization
  if (isJsonResponse) {
    // Only mask sensitive data patterns, don't replace entire content
    const maskedText = maskSensitiveData(text);

    // Only apply content sanitization if we detect actual secrets
    const sanitizationResult = ContentSanitizer.sanitizeContent(text);
    if (
      sanitizationResult.hasSecrets &&
      sanitizationResult.warnings.length > 0
    ) {
      // For JSON with actual secrets, we need to be careful not to break the JSON structure
      // Apply selective sanitization only to the detected secret parts
      return sanitizationResult.content;
    }

    return maskedText;
  } else {
    // For non-JSON responses, apply full sanitization
    const sanitizationResult = ContentSanitizer.sanitizeContent(text);
    const maskedText = maskSensitiveData(sanitizationResult.content);

    // Add security warnings for non-JSON responses
    if (sanitizationResult.warnings.length > 0) {
      const warningText = sanitizationResult.warnings
        .map(w => `⚠️ ${w}`)
        .join('\n');
      return `${maskedText}\n\n--- Security Notice ---\n${warningText}`;
    }

    return maskedText;
  }
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
