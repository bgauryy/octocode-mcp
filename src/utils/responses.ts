import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export function createResult(options: {
  data?: unknown;
  error?: unknown | string;
  suggestions?: string[];
}): CallToolResult {
  const { data, error, suggestions } = options;

  if (error) {
    const errorMessage =
      typeof error === 'string'
        ? error
        : (error as Error).message || 'Unknown error';
    const text = `${errorMessage}${suggestions ? ` | Try: ${suggestions.join(', ')}` : ''}`;

    return {
      content: [{ type: 'text', text }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError: false,
  };
}

// Helper function for JSON parsing with error handling
export function parseJsonResponse<T>(jsonString: string): {
  data: T;
  parsed: boolean;
} {
  try {
    const parsed = JSON.parse(jsonString);
    return { data: parsed, parsed: true };
  } catch {
    return { data: jsonString as unknown as T, parsed: false };
  }
}
