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
 * Detect organizational/private package patterns
 */
export function detectOrganizationalQuery(query: string): {
  isOrgQuery: boolean;
  orgName?: string;
  packageName?: string;
  needsOrgAccess: boolean;
} {
  // Match @org/package pattern
  const orgPackageMatch = query.match(/@([^/\s]+)\/([^/\s]+)/);
  if (orgPackageMatch) {
    return {
      isOrgQuery: true,
      orgName: orgPackageMatch[1],
      packageName: `@${orgPackageMatch[1]}/${orgPackageMatch[2]}`,
      needsOrgAccess: true,
    };
  }

  // Common enterprise org patterns
  const enterpriseOrgs = [
    'wix',
    'microsoft',
    'google',
    'facebook',
    'netflix',
    'uber',
    'airbnb',
  ];
  const orgMatch = enterpriseOrgs.find(
    org =>
      query.toLowerCase().includes(org) ||
      query.toLowerCase().includes(`@${org}`)
  );

  if (orgMatch) {
    return {
      isOrgQuery: true,
      orgName: orgMatch,
      needsOrgAccess: true,
    };
  }

  return {
    isOrgQuery: false,
    needsOrgAccess: false,
  };
}

/**
 * Create optimized error response with smart fallbacks
 */
export function createSmartError(
  tool: string,
  operation: string,
  error: string,
  query?: string
): CallToolResult {
  // Simple fallback suggestions based on tool type
  let suggestions = '';
  if (query) {
    if (tool.includes('SEARCH_REPOS')) {
      suggestions = ' → Try npm_search_packages or github_search_topics';
    } else if (tool.includes('SEARCH_CODE')) {
      suggestions = ' → Try github_search_repositories + explore structure';
    } else if (tool.includes('NPM_SEARCH')) {
      suggestions = ' → Try github_search_repositories';
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `${operation} failed: ${error}${suggestions}`,
      },
    ],
    isError: true,
  };
}

// Helper function to create standardized success responses
export function createStandardResponse(args: {
  searchType: string;
  query: string | undefined;
  data: any;
  failureSuggestions?: string[];
}): CallToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            searchType: args.searchType,
            query: args.query,
            results: args.data,
            ...(args.failureSuggestions &&
              args.failureSuggestions.length > 0 && {
                suggestions: args.failureSuggestions,
              }),
          },
          null,
          2
        ),
      },
    ],
    isError: false,
  };
}

// Helper function to generate standard suggestions
export function generateStandardSuggestions(
  query: string,
  excludeTools: string[] = []
): string[] {
  const allSuggestions = [
    `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${query}"`,
    `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${query}"`,
    `${TOOL_NAMES.GITHUB_SEARCH_ISSUES} "${query}"`,
    `${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} "${query}"`,
    `${TOOL_NAMES.GITHUB_SEARCH_COMMITS} "${query}"`,
    `${TOOL_NAMES.GITHUB_SEARCH_TOPICS} "${query}"`,

    `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${query}"`,
  ];

  return allSuggestions
    .filter(suggestion => !excludeTools.some(tool => suggestion.includes(tool)))
    .slice(0, 3);
}
