import { CallToolResult } from '@modelcontextprotocol/sdk/types';

// Private helper function - not exported
function createResult(
  data: unknown,
  isError = false,
  suggestions?: string[]
): CallToolResult {
  let text: string;

  if (isError) {
    // For errors, handle both string and object types
    const errorText =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    text = `ERROR: ${errorText}${suggestions ? ` | Try: ${suggestions.join(', ')}` : ''}`;
  } else {
    // For success, format as JSON if it's an object, otherwise as string
    text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

export function createSuccessResult(data: unknown | string): CallToolResult {
  return createResult(data, false);
}

export function createErrorResult(
  message: unknown | string,
  error?: unknown
): CallToolResult {
  let errorMessage: string;

  if (typeof message === 'string') {
    errorMessage = error ? `${message}: ${(error as Error).message}` : message;
  } else {
    errorMessage = JSON.stringify(message, null, 2);
  }

  return createResult(errorMessage, true);
}

// ENHANCED PARSING UTILITY
export function parseJsonResponse<T = unknown>(
  responseText: string,
  fallback: T | null = null
): {
  data: T;
  parsed: boolean;
} {
  try {
    const data = JSON.parse(responseText) as T;
    return { data, parsed: true };
  } catch {
    return { data: (fallback || responseText) as T, parsed: false };
  }
}

/**
 * Formats an ISO date string or null/undefined to YYYY-MM-DD format
 * @param dateStr - ISO date string (e.g., "2023-10-26T12:00:00Z") or null/undefined
 * @returns Formatted date string "YYYY-MM-DD" or null if input is null/undefined
 */
export function formatDateToYYYYMMDD(
  dateStr: string | null | undefined
): string | null {
  if (!dateStr) {
    return null;
  }

  try {
    const date = new Date(dateStr);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return null;
    }

    // Format to YYYY-MM-DD
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
