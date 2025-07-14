import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { maskSensitiveData } from '../sanitizer/mask';

export function createResult(options: {
  data?: unknown;
  error?: unknown | string;
}): CallToolResult {
  const { data, error } = options;

  if (error) {
    const errorMessage =
      typeof error === 'string'
        ? error
        : (error as Error).message || 'Unknown error';

    return {
      content: [{ type: 'text', text: wrapResponse(errorMessage) }],
      isError: true,
    };
  }

  try {
    return {
      content: [{ type: 'text', text: wrapResponse(data) }],
      isError: false,
    };
  } catch (jsonError) {
    return {
      content: [
        {
          type: 'text',
          text: wrapResponse(
            `JSON serialization failed: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`
          ),
        },
      ],
      isError: true,
    };
  }
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
  // Sanitize/escape untrusted data
  return maskSensitiveData(text);
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
  return match ? match[1] : url;
}

/**
 * Extract first line of commit message
 */
export function getCommitTitle(message: string): string {
  return message.split('\n')[0].trim();
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
  return match ? match[1] : url;
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
