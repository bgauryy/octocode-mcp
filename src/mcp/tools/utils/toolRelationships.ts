import {
  API_STATUS_CHECK_TOOL_NAME,
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  GITHUB_SEARCH_CODE_TOOL_NAME,
  GITHUB_SEARCH_COMMITS_TOOL_NAME,
  GITHUB_SEARCH_ISSUES_TOOL_NAME,
  GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  PACKAGE_SEARCH_TOOL_NAME,
} from './toolConstants';

interface ToolRelationship {
  fallbackTools: Array<{
    tool: string;
    reason: string;
    condition?: string;
  }>;
  nextSteps: Array<{
    tool: string;
    reason: string;
    priority?: 'high' | 'medium' | 'low';
  }>;
  prerequisites?: Array<{
    tool: string;
    reason: string;
  }>;
  deepResearchSteps?: Array<{
    tool: string;
    reason: string;
    trigger: string;
  }>;
}

const TOOL_RELATIONSHIPS: Record<string, ToolRelationship> = {
  [PACKAGE_SEARCH_TOOL_NAME]: {
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
        reason:
          'to explore the package source code structure and understand architecture',
        priority: 'high',
      },
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to examine package.json, README, and main entry files',
        priority: 'high',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find real-world usage examples in other projects',
        priority: 'medium',
      },
    ],
    deepResearchSteps: [
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to check known issues, bugs, and community discussions',
        trigger: 'when evaluating package reliability',
      },
      {
        tool: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        reason: 'to understand recent changes and development activity',
        trigger: 'when assessing package maintenance',
      },
    ],
  },

  [GITHUB_SEARCH_REPOSITORIES_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
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
        reason: 'to examine repository structure and identify key files',
        priority: 'high',
      },
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason:
          'to analyze dependencies if repository contains package.json or requirements.txt',
        priority: 'high',
      },
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to read README, documentation, and configuration files',
        priority: 'medium',
      },
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to check open issues and community discussions',
        priority: 'medium',
      },
    ],
    deepResearchSteps: [
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find specific implementations within the repository',
        trigger: 'after understanding structure',
      },
      {
        tool: GITHUB_SEARCH_COMMITS_TOOL_NAME,
        reason: 'to understand development history and recent changes',
        trigger: 'when evaluating repository activity',
      },
    ],
  },

  [GITHUB_SEARCH_CODE_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason: 'if searching for package implementations or dependencies',
      },
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find repositories by topic when code search fails',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to understand repository layout before searching',
      },
      {
        tool: API_STATUS_CHECK_TOOL_NAME,
        reason: 'if no results (might be private repos or auth issues)',
        condition: 'no_results',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to view full file contents with matchString for context',
        priority: 'high',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to explore repository structure and find related files',
        priority: 'high',
      },
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason: 'to resolve any packages/dependencies found in the code',
        priority: 'medium',
      },
    ],
    prerequisites: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to verify file paths and understand project structure',
      },
    ],
    deepResearchSteps: [
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason:
          'to search for usage patterns, tests, and related implementations',
        trigger: 'after finding initial code matches',
      },
      {
        tool: GITHUB_SEARCH_COMMITS_TOOL_NAME,
        reason: 'to understand code evolution and recent changes',
        trigger: 'when investigating specific code patterns',
      },
    ],
  },

  [GITHUB_GET_FILE_CONTENT_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to verify correct file path and explore alternatives',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to search for similar files or patterns',
      },
    ],
    nextSteps: [
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason:
          'to resolve any imports, dependencies, or packages mentioned in the file',
        priority: 'high',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason:
          'to find usage examples, tests, or related implementations based on file content',
        priority: 'high',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to explore related files and understand broader context',
        priority: 'medium',
      },
    ],
    prerequisites: [
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to verify file exists and get correct path',
      },
    ],
    deepResearchSteps: [
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason:
          'to search for specific functions, classes, or patterns found in the file',
        trigger: 'after analyzing file content',
      },
      {
        tool: GITHUB_SEARCH_COMMITS_TOOL_NAME,
        reason: 'to understand file evolution and recent changes',
        trigger: 'when investigating specific code sections',
      },
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to find discussions about specific code sections or bugs',
        trigger: 'when code contains TODO, FIXME, or unusual patterns',
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
        reason: 'to read key files like README, package.json, config files',
        priority: 'high',
      },
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason:
          'to analyze dependencies from package.json, requirements.txt, or similar files',
        priority: 'high',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to search within the repository using discovered structure',
        priority: 'medium',
      },
    ],
    deepResearchSteps: [
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason:
          'to search for specific patterns in important directories (src/, lib/, components/)',
        trigger: 'after identifying key directories',
      },
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason:
          'to examine configuration files, build scripts, and documentation',
        trigger: 'when understanding project setup',
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
        reason: 'to find related discussions and bug reports',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason:
          'to view files from specific commits using commit SHAs as branch parameter',
        priority: 'high',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason:
          'to find current implementation and compare with historical changes',
        priority: 'medium',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to understand repository context for the commits',
        priority: 'medium',
      },
    ],
    deepResearchSteps: [
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason:
          'to understand package updates or dependency changes in commits',
        trigger: 'when commits involve package.json or dependency changes',
      },
      {
        tool: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        reason: 'to find PRs associated with important commits',
        trigger: 'when investigating significant changes',
      },
    ],
  },

  [GITHUB_SEARCH_ISSUES_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        reason: 'to find related PRs and solutions',
      },
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to find the repository first',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find code related to issue discussions',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        reason: 'to find solutions or implementations for the issues',
        priority: 'high',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find code related to the issues',
        priority: 'medium',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to understand repository context for the issues',
        priority: 'medium',
      },
    ],
    deepResearchSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to examine specific files mentioned in issues',
        trigger: 'when issues reference specific files or code sections',
      },
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason: 'to investigate dependencies mentioned in issues',
        trigger: 'when issues involve package conflicts or compatibility',
      },
    ],
  },

  [GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME]: {
    fallbackTools: [
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to find related issues and original problem statements',
      },
      {
        tool: GITHUB_SEARCH_COMMITS_TOOL_NAME,
        reason:
          'to find specific commit SHAs from PR for detailed file viewing',
      },
    ],
    nextSteps: [
      {
        tool: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        reason: 'to view PR files using head/base branch names or commit SHAs',
        priority: 'high',
      },
      {
        tool: GITHUB_SEARCH_CODE_TOOL_NAME,
        reason: 'to find current implementation and compare with PR changes',
        priority: 'medium',
      },
      {
        tool: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        reason: 'to understand repository context for the PR changes',
        priority: 'medium',
      },
    ],
    deepResearchSteps: [
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason: 'to understand any package or dependency changes in the PR',
        trigger:
          'when PR involves package.json, requirements.txt, or dependency updates',
      },
      {
        tool: GITHUB_SEARCH_ISSUES_TOOL_NAME,
        reason: 'to find original issues that motivated the PR',
        trigger: 'when understanding PR context and motivation',
      },
    ],
  },

  [API_STATUS_CHECK_TOOL_NAME]: {
    fallbackTools: [],
    nextSteps: [
      {
        tool: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        reason: 'to search accessible repositories',
        priority: 'high',
      },
      {
        tool: PACKAGE_SEARCH_TOOL_NAME,
        reason: 'to search public packages',
        priority: 'high',
      },
    ],
  },
};

/**
 * Get comprehensive tool suggestions based on current context and research depth
 */
export function getToolSuggestions(
  currentTool: string,
  context: {
    hasError?: boolean;
    errorType?: 'no_results' | 'access_denied' | 'not_found' | 'rate_limit';
    hasResults?: boolean;
    hasFileContent?: boolean;
    hasDependencies?: boolean;
    researchDepth?: 'shallow' | 'medium' | 'deep';
  }
): {
  fallback: Array<{ tool: string; reason: string }>;
  nextSteps: Array<{ tool: string; reason: string; priority?: string }>;
  prerequisites: Array<{ tool: string; reason: string }>;
  deepResearch: Array<{ tool: string; reason: string; trigger: string }>;
} {
  const relationships = TOOL_RELATIONSHIPS[currentTool];

  if (!relationships) {
    return { fallback: [], nextSteps: [], prerequisites: [], deepResearch: [] };
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

  // Return next steps only if operation was successful, prioritized by importance
  const nextSteps = context.hasResults
    ? relationships.nextSteps.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return (
          priorityOrder[a.priority || 'medium'] -
          priorityOrder[b.priority || 'medium']
        );
      })
    : [];

  // Include deep research steps based on context and research depth
  const deepResearch =
    context.researchDepth === 'deep' ||
    context.hasFileContent ||
    context.hasDependencies
      ? relationships.deepResearchSteps || []
      : [];

  return {
    fallback,
    nextSteps,
    prerequisites: relationships.prerequisites || [],
    deepResearch,
  };
}

/**
 * Generate enhanced hints with smart research flows
 */
export function generateSmartResearchHints(
  currentTool: string,
  context: {
    hasResults?: boolean;
    foundPackages?: string[];
    foundFiles?: string[];
    repositoryContext?: { owner: string; repo: string };
    errorType?: string;
  }
): string[] {
  const hints: string[] = [];
  const suggestions = getToolSuggestions(currentTool, {
    hasResults: context.hasResults,
    researchDepth: 'deep',
    hasFileContent: context.foundFiles && context.foundFiles.length > 0,
    hasDependencies: context.foundPackages && context.foundPackages.length > 0,
  });

  // Add structure examination hints
  if (
    currentTool !== GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME &&
    context.repositoryContext
  ) {
    hints.push(
      `🏗️  STRUCTURE: Use ${GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME} to examine ${context.repositoryContext.owner}/${context.repositoryContext.repo} architecture`
    );
  }

  // Add package resolution hints
  if (context.foundPackages && context.foundPackages.length > 0) {
    hints.push(
      `📦 PACKAGES: Use ${PACKAGE_SEARCH_TOOL_NAME} to resolve dependencies: ${context.foundPackages.slice(0, 3).join(', ')}`
    );
  }

  // Add deep research hints
  if (context.foundFiles && context.foundFiles.length > 0) {
    hints.push(
      `🔍 DEEP SEARCH: Use content from ${context.foundFiles[0]} to search for related implementations`
    );
  }

  // Add next steps based on success
  if (context.hasResults && suggestions.nextSteps.length > 0) {
    const highPriority = suggestions.nextSteps.filter(
      s => s.priority === 'high'
    );
    if (highPriority.length > 0) {
      hints.push(
        `⚡ NEXT: ${highPriority[0].reason} using ${highPriority[0].tool}`
      );
    }
  }

  // Add fallback suggestions for errors
  if (!context.hasResults && suggestions.fallback.length > 0) {
    hints.push(
      `🔄 FALLBACK: ${suggestions.fallback[0].reason} using ${suggestions.fallback[0].tool}`
    );
  }

  return hints;
}
