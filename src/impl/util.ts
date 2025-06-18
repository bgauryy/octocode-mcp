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

// CONSOLIDATED ERROR & SUCCESS HANDLING
export function createResult(
  data: any,
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
export function createSuccessResult(data: any): CallToolResult {
  return createResult(data, false);
}

export function createErrorResult(
  message: string,
  error: unknown
): CallToolResult {
  return createResult(`${message}: ${(error as Error).message}`, true);
}

// STANDARD RESPONSE - Simplified
export function createStandardResponse(args: {
  query?: string;
  data: any;
  suggestions?: string[];
}): CallToolResult {
  return createResult({
    q: args.query,
    results: args.data,
    ...(args.suggestions?.length && { suggestions: args.suggestions }),
  });
}

// ENHANCED PARSING UTILITY
export function parseJsonResponse(
  responseText: string,
  fallback: any = null
): {
  data: any;
  parsed: boolean;
} {
  try {
    const data = JSON.parse(responseText);
    return { data, parsed: true };
  } catch {
    return { data: fallback || responseText, parsed: false };
  }
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
 * Generate fallback suggestions for no results - ensures no tool suggests itself
 */
export function getNoResultsSuggestions(currentTool: string): string[] {
  const suggestions: string[] = [];

  // Tool-specific fallbacks
  switch (currentTool) {
    case TOOL_NAMES.GITHUB_SEARCH_REPOS:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.NPM_PACKAGE_SEARCH
      );
      break;
    case TOOL_NAMES.GITHUB_SEARCH_CODE:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_REPOS,
        TOOL_NAMES.GITHUB_SEARCH_ISSUES
      );
      break;
    case TOOL_NAMES.GITHUB_SEARCH_TOPICS:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_REPOS,
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.NPM_PACKAGE_SEARCH
      );
      break;
    case TOOL_NAMES.NPM_PACKAGE_SEARCH:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_REPOS,
        TOOL_NAMES.GITHUB_SEARCH_CODE
      );
      break;
    case TOOL_NAMES.GITHUB_SEARCH_ISSUES:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOS
      );
      break;
    case TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        TOOL_NAMES.GITHUB_SEARCH_CODE
      );
      break;
    case TOOL_NAMES.GITHUB_SEARCH_COMMITS:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOS
      );
      break;
    case TOOL_NAMES.GITHUB_GET_CONTENTS:
    case TOOL_NAMES.GITHUB_GET_FILE_CONTENT:
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_REPOS,
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_TOPICS
      );
      break;
    default:
      // Fallback for any other tools
      suggestions.push(
        TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        TOOL_NAMES.GITHUB_SEARCH_REPOS,
        TOOL_NAMES.GITHUB_SEARCH_CODE
      );
  }

  return suggestions.slice(0, 3);
}

/**
 * Generate fallback suggestions for errors - ensures no tool suggests itself
 */
export function getErrorSuggestions(currentTool: string): string[] {
  const suggestions: string[] = [];

  // Always suggest API status check first (unless it's the current tool)
  if (currentTool !== TOOL_NAMES.API_STATUS_CHECK) {
    suggestions.push(TOOL_NAMES.API_STATUS_CHECK);
  }

  // Add discovery alternatives
  if (currentTool !== TOOL_NAMES.GITHUB_SEARCH_TOPICS) {
    suggestions.push(TOOL_NAMES.GITHUB_SEARCH_TOPICS);
  }
  if (currentTool !== TOOL_NAMES.GITHUB_SEARCH_REPOS) {
    suggestions.push(TOOL_NAMES.GITHUB_SEARCH_REPOS);
  }

  return suggestions.slice(0, 3);
}
