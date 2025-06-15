import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { TOOL_NAMES } from '../mcp/systemPrompts';

/**
 * Determines if a string needs quoting for GitHub search
 */
export function needsQuoting(str: string): boolean {
  return (
    str.includes(' ') ||
    str.includes('"') ||
    str.includes('\t') ||
    str.includes('\n') ||
    str.includes('\r') ||
    /[<>(){}[\]\\|&;]/.test(str)
  );
}

export function createSuccessResult(data: any): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  };
}

export function createErrorResult(
  message: string,
  error: unknown
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${message}: ${(error as Error).message}`,
      },
    ],
    isError: true,
  };
}

/**
 * Create optimized error response with minimal token usage
 */
export function createOptimizedError(
  operation: string,
  error: string,
  suggestions?: string[]
): CallToolResult {
  const suggestionsText = suggestions ? `. Try: ${suggestions.join(', ')}` : '';
  return {
    content: [
      {
        type: 'text',
        text: `${operation} failed: ${error}${suggestionsText}`,
      },
    ],
    isError: true,
  };
}

/**
 * Create optimized success response with essential metadata only
 */
export function createOptimizedSuccess(
  data: any,
  summary?: { [key: string]: any }
): CallToolResult {
  let text: string;

  if (summary) {
    const summaryText = Object.entries(summary)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    text = `${summaryText}\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
  } else {
    text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError: false,
  };
}

/**
 * Smart error analysis for common GitHub API errors
 */
export function analyzeGitHubError(error: string): {
  type: string;
  suggestions: string[];
} {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('404') || errorLower.includes('not found')) {
    return {
      type: 'not_found',
      suggestions: [
        `${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore`,
        `${TOOL_NAMES.GITHUB_SEARCH_CODE} to find files`,
      ],
    };
  }

  if (errorLower.includes('403') || errorLower.includes('forbidden')) {
    return {
      type: 'permission',
      suggestions: [
        `${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access`,
        'check if repo is private',
      ],
    };
  }

  if (errorLower.includes('rate limit') || errorLower.includes('429')) {
    return {
      type: 'rate_limit',
      suggestions: [
        'wait before retry',
        `use ${TOOL_NAMES.GITHUB_SEARCH_CODE} instead`,
      ],
    };
  }

  if (errorLower.includes('authentication') || errorLower.includes('401')) {
    return {
      type: 'auth',
      suggestions: ['gh auth login', 'check GitHub CLI auth'],
    };
  }

  return {
    type: 'unknown',
    suggestions: ['check input parameters', 'try alternative search methods'],
  };
}

/**
 * Generate smart fallback suggestions based on search context
 */
export function generateSmartFallbacks(
  searchType: string,
  query: string,
  context?: { owner?: string; repo?: string }
): string[] {
  const fallbacks: string[] = [];

  switch (searchType) {
    case 'code':
      fallbacks.push(`${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${query}"`);
      if (context?.owner) {
        fallbacks.push(
          `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${query}" owner:${context.owner}`
        );
      }
      fallbacks.push(`${TOOL_NAMES.GITHUB_SEARCH_ISSUES} "${query}"`);
      break;

    case 'repos':
      fallbacks.push(`${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${query}"`);
      fallbacks.push(`${TOOL_NAMES.GITHUB_SEARCH_TOPICS} "${query}"`);
      fallbacks.push(`${TOOL_NAMES.GITHUB_SEARCH_CODE} "${query}"`);
      break;

    case 'issues':
      fallbacks.push(`${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} "${query}"`);
      fallbacks.push(`${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${query}"`);
      fallbacks.push(`${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${query}"`);
      break;

    default:
      fallbacks.push(`${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${query}"`);
      fallbacks.push(`${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${query}"`);
  }

  return fallbacks.slice(0, 3); // Limit to 3 suggestions for token efficiency
}
