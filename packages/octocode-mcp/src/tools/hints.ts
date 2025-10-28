import { TOOL_NAMES } from '../constants.js';

export const TOOL_HINTS = {
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    hasResults: [
      'CRITICAL: Include absolute GitHub URLs (https://github.com/owner/repo/blob/branch/path#L123-L456) with line numbers in summaries',
      'CRITICAL: Cross-validate findings by examining docs, tests, examples, and related implementations',
      'SET researchGoal: Describe what patterns/implementations you seek (e.g., "authentication flows using JWT")',
      'SET reasoning: Explain why each query targets the research goal (e.g., "searching for token validation to understand auth flow")',
      'Refine queries using domain terms from researchGoal - extract function/class names from results as new keywords',
      `Extract text_matches and use matchString in ${TOOL_NAMES.GITHUB_FETCH_CONTENT} for precise code snippets`,
      `Switch between match='file' (content) and match='path' (discovery) to triangulate - explain in reasoning`,
      `Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to locate entry points before searching content`,
      'Bulk queries: run multiple variations (filename/extension/path) in parallel - explain strategy in reasoning',
    ],
    empty: [
      'SET researchGoal: Broaden to higher-level concepts (e.g., "auth" → "user authentication and authorization")',
      'SET reasoning: Explain why initial query failed and new approach (e.g., "too specific, broadening to framework patterns")',
      `Switch to match='path' for discovery - search filenames before content`,
      'Reduce keywords to avoid AND logic constraints - align with core researchGoal terms',
      'Drop owner/repo filters to discover cross-repo patterns, then narrow',
      'Search examples/tests directories - usage patterns reveal implementation details',
      'Try alternative terms from reasoning (e.g., "jwt" → "token", "bearer", "auth header")',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: {
    hasResults: [
      'CRITICAL: Include absolute GitHub URLs (https://github.com/owner/repo) in summaries',
      'CRITICAL: Cross-validate by examining README, docs, examples across multiple repos',
      'SET researchGoal: Define what repo characteristics you need (e.g., "TypeScript MCP servers with authentication")',
      'SET reasoning: Explain repo selection criteria (e.g., "stars>1000 ensures battle-tested, topicsToSearch for MCP ecosystem")',
      `Map structure with ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE}, then ${TOOL_NAMES.GITHUB_SEARCH_CODE} for implementations`,
      `Fetch README with ${TOOL_NAMES.GITHUB_FETCH_CONTENT} to validate alignment with researchGoal`,
      'Compare repos: document common patterns, dependencies, and architectural differences in summary',
      'Bulk-query variations (topicsToSearch + keywordsToSearch) - explain strategy in reasoning',
    ],
    empty: [
      'SET researchGoal: Broaden scope (e.g., "MCP TypeScript" → "Model Context Protocol implementations")',
      'SET reasoning: Explain why search failed and new strategy (e.g., "too narrow, trying topic-based discovery")',
      'Start with topicsToSearch for curated discovery - more precise than keywords',
      'Separate topicsToSearch and keywordsToSearch into distinct bulk queries',
      'Adjust filters: relax stars/size/date if too restrictive - document threshold in reasoning',
      'Add synonyms from reasoning (e.g., "server" → "provider", "plugin", "adapter")',
      `Try match=['name'] for targeted name-only search`,
    ],
  },

  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    hasResults: [
      'CRITICAL: Include absolute GitHub URLs (https://github.com/owner/repo/tree/branch/path) for directories',
      'CRITICAL: Cross-validate by exploring src, tests, docs, examples to map full structure',
      'SET researchGoal: Define what structure you seek (e.g., "locate API implementation and test patterns")',
      'SET reasoning: Explain directory exploration strategy (e.g., "depth=2 on src/ to find service layer")',
      `Turn paths into ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries with extension filters (e.g., src/api/*.ts)`,
      'Document directory purpose in summary: entry points, configs, implementations, tests',
    ],
    empty: [
      'SET researchGoal: Clarify what directories to locate (e.g., "find authentication module structure")',
      'SET reasoning: Explain why structure not found (e.g., "non-standard layout, trying root depth=1")',
      'Start at root with depth=1, then drill down - document path in reasoning',
      `Validate repo exists via ${TOOL_NAMES.GITHUB_SEARCH_CODE} with match='path'`,
      'For monorepos: explore packages/, apps/, workspaces/ separately',
    ],
  },

  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    hasResults: [
      'CRITICAL: Include absolute GitHub URLs (https://github.com/owner/repo/blob/branch/path#L123-L456) with line numbers',
      'CRITICAL: Cross-validate by checking related files, tests, usage examples, and doc comments',
      'SET researchGoal: Describe what code patterns to extract (e.g., "JWT validation implementation details")',
      'SET reasoning: Explain why fetching this file (e.g., "contains validateToken function found in search")',
      'Use matchString from text_matches with context lines - cite line numbers in summary',
      'Prefer startLine/endLine over fullContent for efficiency - justify range in reasoning',
      `Follow imports/exports to queue ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries - document chain in reasoning`,
    ],
    empty: [
      'SET researchGoal: Clarify what file content needed (e.g., "authentication middleware source code")',
      'SET reasoning: Explain why fetch failed (e.g., "path incorrect, validating via VIEW_REPO_STRUCTURE")',
      `Validate path via ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE} match='path'`,
      'Try omitting branch for auto-detect or use main/master/develop',
      'Check case-sensitivity and path format - document in reasoning',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: {
    hasResults: [
      'CRITICAL: Include absolute GitHub URLs (https://github.com/owner/repo/pull/123) for PRs',
      'CRITICAL: Cross-validate by examining discussions, diffs, related issues, and review comments',
      'SET researchGoal: Define what PR patterns to find (e.g., "authentication refactor implementations")',
      'SET reasoning: Explain filter strategy (e.g., "merged=true for production code, author=security-team for expertise")',
      'Use state="closed"+merged=true for proven implementations - justify in reasoning',
      'Enable withContent/withComments selectively (token-expensive) - explain need in reasoning',
      `Extract changed files/functions into ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries - document chain`,
      `Use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} for specific changed files - cite PR context`,
    ],
    empty: [
      'SET researchGoal: Broaden PR search scope (e.g., "auth PRs" → "security-related changes")',
      'SET reasoning: Explain why search failed and new approach (e.g., "too specific, trying label filters")',
      'Use direct prNumber if known (fastest) - document PR number source in reasoning',
      'Relax filters progressively: remove state/labels/author/merged constraints',
      'Widen date ranges and search title/body/comments with researchGoal keywords',
      'Try head/base branch filters for workstream-specific PRs',
    ],
  },
} as const;

/**
 * Generic error recovery hints applicable to all tools
 */
export const GENERIC_ERROR_HINTS = [
  'Check authentication token validity and required scopes',
  'Verify network connectivity and GitHub API status',
  'Review rate limits and retry after cooldown if exceeded',
  'Validate input parameters (owner, repo, path, branch) for correctness',
  'Check repository visibility (public vs private) and access permissions',
  'Retry the operation after a brief delay for transient errors',
] as const;

export function getToolHints(
  toolName: keyof typeof TOOL_HINTS,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  return TOOL_HINTS[toolName]?.[resultType] ?? [];
}

export function getGenericErrorHints(): readonly string[] {
  return GENERIC_ERROR_HINTS;
}
