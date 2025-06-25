import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export function createResult(options: {
  data?: unknown;
  error?: unknown | string;
  suggestions?: string[];
  cli_command?: string;
}): CallToolResult {
  const { data, error, suggestions, cli_command } = options;

  if (error) {
    const errorMessage =
      typeof error === 'string'
        ? error
        : (error as Error).message || 'Unknown error';

    // Build error response with optional CLI command
    const errorResponse: any = { error: errorMessage };
    if (suggestions) {
      errorResponse.suggestions = suggestions;
    }
    if (cli_command) {
      errorResponse.cli_command = cli_command;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }

  // For successful responses, include cli_command if provided (for debugging)
  if (cli_command && data && typeof data === 'object') {
    const dataWithCli = { ...data, cli_command };
    return {
      content: [{ type: 'text', text: JSON.stringify(dataWithCli, null, 2) }],
      isError: false,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError: false,
  };
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
