import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export function createResult(
  data: unknown,
  isError = false,
  suggestions?: string[]
): CallToolResult {
  const text = isError
    ? `${data}${suggestions ? ` | Try: ${suggestions.join(', ')}` : ''}`
    : JSON.stringify(data, null, 2);

  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

// LEGACY SUPPORT - Remove these once all tools are updated
export function createSuccessResult(data: unknown): CallToolResult {
  return createResult(data, false);
}

export function createErrorResult(
  message: string,
  error: unknown
): CallToolResult {
  return createResult(`${message}: ${(error as Error).message}`, true);
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
