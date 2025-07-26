import { API_STATUS_CHECK_TOOL_NAME } from '../api_status_check';
import { GITHUB_GET_FILE_CONTENT_TOOL_NAME } from '../github_fetch_content';
import { GITHUB_SEARCH_CODE_TOOL_NAME } from '../github_search_code';
import { GITHUB_SEARCH_COMMITS_TOOL_NAME } from '../github_search_commits';
import { GITHUB_SEARCH_ISSUES_TOOL_NAME } from '../github_search_issues';
import { GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME } from '../github_search_pull_requests';
import { GITHUB_SEARCH_REPOSITORIES_TOOL_NAME } from '../github_search_repos';
import { GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME } from '../github_view_repo_structure';
import { NPM_PACKAGE_SEARCH_TOOL_NAME } from '../package_search';

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

const TOOL_RELATIONSHIPS: Record<string, ToolRelationship> = {
  [NPM_PACKAGE_SEARCH_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find repositories by topic or language',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to search for package usage examples',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to explore the package source code structure',
      },
    ],
  },

  [GITHUB_SEARCH_REPOSITORIES_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: NPM_PACKAGE_SEARCH_TOOL_NAME,
        reason: 'if searching for packages or libraries',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to search within repository contents',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to explore repository contents',
      },
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to check open issues and discussions',
      },
      {
        tool: NPM_PACKAGE_SEARCH_TOOL_NAME,
        reason: 'if repository is an NPM package',
      },
    ],
  },

  [GITHUB_SEARCH_CODE_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: NPM_PACKAGE_SEARCH_TOOL_NAME,
        reason: 'if searching for package implementations',
      },
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find repositories by topic',
      },
      {
        tool: API_STATUS_CHECK_TOOL_NAME,
        reason: 'if no results (might be private repos)',
        condition: 'no_results',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to view full file contents',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to explore repository structure',
      },
    ],
    prerequisites: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to verify file paths before searching',
      },
    ],
  },

  [GITHUB_GET_FILE_CONTENT_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to verify correct file path',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to search for similar files',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to explore related files',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find usage examples',
      },
    ],
    prerequisites: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to verify file exists and get correct path',
      },
    ],
  },

  [GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find the correct repository',
      },
      {
        tool: API_STATUS_CHECK_TOOL_NAME,
        reason: 'if access denied (check authentication)',
        condition: 'access_denied',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to read specific files',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to search within the repository',
      },
    ],
  },

  [GITHUB_SEARCH_COMMITS_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find repositories first',
      },
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to find related discussions',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason:
          'to view files from specific commits using returned commit SHAs as branch parameter',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find current implementation',
      },
    ],
  },

  [GITHUB_SEARCH_ISSUES_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        reason: 'to find related PRs',
      },
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find the repository first',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        reason: 'to find solutions or implementations',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find related code',
      },
    ],
  },

  [GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to find related issues',
      },
      {
        tool: GITHUB_SEARCH_COMMITS_TOOL_NAME,
        reason: 'to find specific commit SHAs from PR for file viewing',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to view PR files using head/base branch names or commit SHAs',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find current implementation',
      },
    ],
  },

  [API_STATUS_CHECK_TOOL_NAME]: {
    fallbackTools: [],
    nextSteps: [
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to search accessible repositories',
      },
      {
        tool: NPM_PACKAGE_SEARCH_TOOL_NAME,
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
