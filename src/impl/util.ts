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

// Helper function to generate standard suggestions
export function generateStandardSuggestions(
  query: string,
  excludeTools: string[] = []
): string[] {
  const allSuggestions = [
    `${TOOL_NAMES.NPM_PACKAGE_SEARCH}`,
    `${TOOL_NAMES.GITHUB_SEARCH_REPOS}`,
    `${TOOL_NAMES.GITHUB_SEARCH_CODE}`,
  ];

  return allSuggestions
    .filter(suggestion => !excludeTools.some(tool => suggestion.includes(tool)))
    .slice(0, 2); // Reduced to 2 for token efficiency
}
