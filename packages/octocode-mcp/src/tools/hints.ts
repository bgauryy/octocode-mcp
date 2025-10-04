import { TOOL_NAMES, ToolName } from '../constants';

export interface HintContext {
  toolName: ToolName;
  resultType: 'successful' | 'empty' | 'failed';
  errorMessage?: string;
}

export interface OrganizedHints {
  successful?: string[];
  empty?: string[];
  failed?: string[];
}

export function getHints(context: HintContext): OrganizedHints {
  const hints: OrganizedHints = {};

  if (context.resultType === 'successful') {
    const successfulHints = getSuccessfulHints(context.toolName);
    if (successfulHints.length > 0) {
      hints.successful = successfulHints;
    }
  }

  if (context.resultType === 'empty') {
    const emptyHints = getEmptyHints(context.toolName);
    if (emptyHints.length > 0) {
      hints.empty = emptyHints;
    }
  }

  if (context.resultType === 'failed') {
    const failedHints = getFailedHints(context.toolName, context.errorMessage);
    if (failedHints.length > 0) {
      hints.failed = failedHints;
    }
  }

  return hints;
}

export function generateHints(context: HintContext): OrganizedHints {
  return getHints(context);
}

export function generateEmptyQueryHints(_toolName: ToolName): string[] {
  return [
    'Queries array is required and cannot be empty',
    'Provide at least one valid query with required parameters',
  ];
}

const NAVIGATION_GENERAL: string[] = [
  'Chain tools: repository search → structure view → code search → content fetch',
  'Compare implementations across 3-5 repositories to identify best practices',
];

// Tool-specific navigation hints
const NAVIGATION_TOOL: Record<string, string[]> = {
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: [
    'Use github_fetch_content with matchString from search results for precise context extraction',
  ],
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: [
    'Use github_view_repo_structure first to understand project layout',
    'Start with repository search to find relevant projects, then search within them',
  ],
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: [
    'Examine imports/exports to understand dependencies and usage',
  ],
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: [
    'Focus on source code and example directories for implementation details',
  ],
};

// General research hints for successful results
const RESEARCH_GENERAL: string[] = [
  'Analyze top results in depth before expanding search',
  'Cross-reference findings across multiple sources',
];

// Tool-specific research hints
const RESEARCH_TOOL: Record<string, string[]> = {
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: [
    'Use function/class names or error strings as keywords to find definitions and usages',
    'Derive matchString for file fetches from code search text_matches',
    'Scope away from noise directories by setting path to src/, packages/*/src',
  ],
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: [
    'Prioritize via sort and analyze the top 3-5 repositories in depth',
    'After selection, run structure view first, then scoped code search',
    'Avoid curated list repos by using implementation-oriented keywords',
  ],
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: [
    'Prefer partial reads for token efficiency',
    'When readability matters (e.g., JSON/Markdown), consider minified: false',
    'Use matchString from code search text_matches and increase matchStringContextLines if needed',
  ],
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: [
    'Explore src/ or packages/ first for relevant files',
    'Use depth: 2 to surface key files/folders quickly',
    'Build targeted code searches from discovered path and filename patterns',
  ],
  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: [
    'Pull implementation diffs with withContent: true',
    'Add withComments: true to understand decisions',
    'After finding a PR, fetch changed files for deeper analysis',
  ],
};

// General no-results hints
const NO_RESULTS_GENERAL: string[] = [
  'Try broader search terms or related concepts',
  'Use functional descriptions that focus on what the code accomplishes',
];

// Tool-specific no-results hints
const NO_RESULTS_TOOL: Record<string, string[]> = {
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: [
    'Use extension, filename, path filters to target specific directories and file names',
    'Look in tests: tests/, __tests__/, *.test.*, *.spec.* to discover real usage',
    'After discovery, add owner/repo to narrow scope; set limit to cap results',
  ],
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: [
    'Combine match: ["readme","description"] to surface documented repos',
    'Use sort: "stars" or "updated" plus limit to prioritize',
    'Apply freshness filters like updated: ">=YYYY-MM-DD"',
  ],
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: [
    'Validate the file path using code search with matching patterns',
    'Try branch fallbacks: main, master, develop or omit branch to use default',
    'Prefer partial reads: use matchString or startLine/endLine instead of fullContent',
  ],
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: [
    'Validate the file path using code search with matching patterns',
    'Try branch fallbacks: main, master, develop or omit branch to use default',
    'For monorepos, try path: "packages", "apps", or "services" and set depth: 2',
  ],
  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: [
    'Filter by state/review status for targeted results',
    'Use time filters created/updated and branch filters base/head to scope',
    'Use label filters to narrow domain (e.g., type: bug, area: docs)',
  ],
};

// General error recovery hints
const ERROR_RECOVERY_GENERAL: Record<string, string> = {
  RATE_LIMIT: 'Rate limit exceeded. Wait 60 seconds before retrying',
  AUTH_REQUIRED:
    'Authentication required. Check your GitHub token configuration',
  NETWORK_ERROR: 'Network error. Check connection and retry',
  NOT_FOUND: 'Resource not found. Verify spelling and accessibility',
  ACCESS_DENIED: 'Access denied. Check permissions or try public repositories',
};

// Tool-specific error recovery hints
const ERROR_RECOVERY_TOOL: Record<string, string[]> = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: [
    'Verify repository owner, name, and file path are correct',
    'Check that the branch exists (try "main" or "master")',
    'Use github_view_repo_structure first to find correct file paths',
  ],
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: [
    'Verify repository owner and name are correct',
    'Check that the branch exists (try "main" or "master")',
    'Ensure you have access to the repository',
  ],
};

function getSuccessfulHints(toolName: ToolName): string[] {
  const hints: string[] = [];

  hints.push(...RESEARCH_GENERAL);

  const toolResearch = RESEARCH_TOOL[toolName];
  if (toolResearch) {
    hints.push(...toolResearch);
  }

  hints.push(...NAVIGATION_GENERAL);
  const toolNavigation = NAVIGATION_TOOL[toolName];
  if (toolNavigation) {
    hints.push(...toolNavigation);
  }

  return hints;
}

function getEmptyHints(toolName: ToolName): string[] {
  const hints: string[] = [];

  hints.push(...NO_RESULTS_GENERAL);

  const toolNoResults = NO_RESULTS_TOOL[toolName];
  if (toolNoResults) {
    hints.push(...toolNoResults);
  }

  hints.push(...NAVIGATION_GENERAL);
  const toolNavigation = NAVIGATION_TOOL[toolName];
  if (toolNavigation) {
    hints.push(...toolNavigation);
  }

  return hints;
}

function getFailedHints(toolName: ToolName, errorMessage?: string): string[] {
  const hints: string[] = [];

  if (errorMessage) {
    const errorType = detectErrorType(errorMessage);
    if (errorType && ERROR_RECOVERY_GENERAL[errorType]) {
      hints.push(ERROR_RECOVERY_GENERAL[errorType]);
    }
  }

  const toolHints = ERROR_RECOVERY_TOOL[toolName];
  if (toolHints) {
    hints.push(...toolHints);
  }

  hints.push(...NAVIGATION_GENERAL);
  const toolNavigation = NAVIGATION_TOOL[toolName];
  if (toolNavigation) {
    hints.push(...toolNavigation);
  }

  return hints;
}

function detectErrorType(
  errorMessage: string
): keyof typeof ERROR_RECOVERY_GENERAL | null {
  const error = errorMessage.toLowerCase();

  if (error.includes('rate limit') || error.includes('too many requests')) {
    return 'RATE_LIMIT';
  }
  if (
    error.includes('auth') ||
    error.includes('token') ||
    error.includes('unauthorized')
  ) {
    return 'AUTH_REQUIRED';
  }
  if (
    error.includes('network') ||
    error.includes('connection') ||
    error.includes('timeout')
  ) {
    return 'NETWORK_ERROR';
  }
  if (error.includes('not found') || error.includes('404')) {
    return 'NOT_FOUND';
  }
  if (
    error.includes('access denied') ||
    error.includes('forbidden') ||
    error.includes('403')
  ) {
    return 'ACCESS_DENIED';
  }

  return null;
}
