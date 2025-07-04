/**
 * Tool relationship map for standardized cross-tool suggestions
 * Defines how tools connect and when to suggest alternatives
 */

export const TOOL_NAMES = {
  API_STATUS_CHECK: 'api_status_check',
  GITHUB_FETCH_CONTENT: 'github_fetch_content',
  GITHUB_SEARCH_CODE: 'github_search_code',
  GITHUB_SEARCH_COMMITS: 'github_search_commits',
  GITHUB_SEARCH_ISSUES: 'github_search_issues',
  GITHUB_SEARCH_PULL_REQUESTS: 'github_search_pull_requests',
  GITHUB_SEARCH_REPOSITORIES: 'github_search_repositories',
  GITHUB_VIEW_REPO_STRUCTURE: 'github_view_repo_structure',
  NPM_PACKAGE_SEARCH: 'npm_package_search',
  NPM_VIEW_PACKAGE: 'npm_view_package',
} as const;

interface ToolRelationship {
  fallbackTools: Array<{
    tool: string;
    reason: string;
    condition?: string;
  }>;
  nextSteps: Array<{
    tool: string;
    reason: string;
  }>;
  prerequisites?: Array<{
    tool: string;
    reason: string;
  }>;
}

export const TOOL_RELATIONSHIPS: Record<string, ToolRelationship> = {
  [TOOL_NAMES.NPM_PACKAGE_SEARCH]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to find repositories by topic or language',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to search for package usage examples',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.NPM_VIEW_PACKAGE,
        reason: 'to get detailed package information and repository URL',
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to explore the package source code structure',
      },
    ],
  },

  [TOOL_NAMES.NPM_VIEW_PACKAGE]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.NPM_PACKAGE_SEARCH,
        reason: 'to discover similar packages',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to find the repository directly',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to explore repository structure',
      },
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'to read specific files like README or package.json',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to find usage examples',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.NPM_PACKAGE_SEARCH,
        reason: 'if searching for packages or libraries',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to search within repository contents',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to explore repository contents',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'to check open issues and discussions',
      },
      {
        tool: TOOL_NAMES.NPM_VIEW_PACKAGE,
        reason: 'if repository is an NPM package',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.NPM_PACKAGE_SEARCH,
        reason: 'if searching for package implementations',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to find repositories by topic',
      },
      {
        tool: TOOL_NAMES.API_STATUS_CHECK,
        reason: 'if no results (might be private repos)',
        condition: 'no_results',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'to view full file contents',
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to explore repository structure',
      },
    ],
    prerequisites: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to verify file paths before searching',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to verify correct file path',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to search for similar files',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to explore related files',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to find usage examples',
      },
    ],
    prerequisites: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'to verify file exists and get correct path',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to find the correct repository',
      },
      {
        tool: TOOL_NAMES.API_STATUS_CHECK,
        reason: 'if access denied (check authentication)',
        condition: 'access_denied',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'to read specific files',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to search within the repository',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to find repositories first',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'to find related discussions',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'to view files changed in commits',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to find current implementation',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'to find related PRs',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to find the repository first',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'to find solutions or implementations',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to find related code',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'to find related issues',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'to find related commits',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'to view PR changes',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'to find current implementation',
      },
    ],
  },

  [TOOL_NAMES.API_STATUS_CHECK]: {
    fallbackTools: [],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'to search accessible repositories',
      },
      {
        tool: TOOL_NAMES.NPM_PACKAGE_SEARCH,
        reason: 'to search public packages',
      },
    ],
  },
};

/**
 * Get tool suggestions based on current context
 */
export function getToolSuggestions(
  currentTool: string,
  context: {
    hasError?: boolean;
    errorType?: 'no_results' | 'access_denied' | 'not_found' | 'rate_limit';
    hasResults?: boolean;
  }
): {
  fallback: Array<{ tool: string; reason: string }>;
  nextSteps: Array<{ tool: string; reason: string }>;
  prerequisites: Array<{ tool: string; reason: string }>;
} {
  const relationships = TOOL_RELATIONSHIPS[currentTool];

  if (!relationships) {
    return { fallback: [], nextSteps: [], prerequisites: [] };
  }

  // Filter fallback tools based on context
  const fallback = relationships.fallbackTools.filter(item => {
    if (!item.condition) return true;

    switch (item.condition) {
      case 'no_results':
        return context.errorType === 'no_results';
      case 'access_denied':
        return context.errorType === 'access_denied';
      default:
        return true;
    }
  });

  // Return next steps only if operation was successful
  const nextSteps = context.hasResults ? relationships.nextSteps : [];

  return {
    fallback,
    nextSteps,
    prerequisites: relationships.prerequisites || [],
  };
}
