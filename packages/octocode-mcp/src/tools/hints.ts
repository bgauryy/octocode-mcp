import { TOOL_NAMES } from '../constants.js';

export const TOOL_HINTS = {
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    hasResults: [
      'Refine next queries using domain-specific terms and synonyms from researchGoal',
      `Extract text_matches and use matchString with context in ${TOOL_NAMES.GITHUB_FETCH_CONTENT} for precise snippets`,
      `Switch between match='file' (content search) and match='path' (file/directory discovery) to triangulate`,
      'Emphasize semantic search: search function/class/interface names and pattern keywords aligned with researchGoal',
      `Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to locate entry points, config files, and documentation`,
      'Run bulk queries: multiple focused variations (by filename, extension, path) in one call for efficiency',
      'Narrow by directory and extension once patterns emerge to focus search scope',
      'Use researchSuggestions to inform and create the next set of targeted searches',
    ],
    empty: [
      'Rephrase using researchGoal concepts; use broader, higher-level terms and synonyms',
      `Switch to match='path' to discover relevant directories and filenames first`,
      'Reduce keyword count to avoid over-constrained AND logic limiting results',
      'Drop owner/repo filters to discover cross-repo patterns, then narrow back to specific repos',
      'Search in examples/tests directories to find usage patterns and working implementations',
      'Introduce alternative library/framework terms or synonyms suggested by reasoning',
      'Generate multiple bulk variations rather than retrying a single query repeatedly',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: {
    hasResults: [
      `Map structure with ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE}, then deep-dive with ${TOOL_NAMES.GITHUB_SEARCH_CODE}`,
      'Sort by stars for popular/mature repos, or updated for active development',
      `Fetch README with ${TOOL_NAMES.GITHUB_FETCH_CONTENT} to validate fit and understand purpose`,
      'Prefer implementation repos over awesome-lists/templates for working code examples',
      'Compare top results: look for common dependencies, patterns, and architectural choices',
      'Bulk-query multiple candidates across different orgs/languages to broaden perspective',
    ],
    empty: [
      'Separate keywordsToSearch and topicsToSearch into distinct queries for better results',
      'Switch between keywordsToSearch (broader, name/description/readme) and topicsToSearch (precise, curated tags)',
      'Adjust filters: use stars filter for popular repos, relax size/date constraints if too restrictive',
      'Add language/framework terms or synonyms derived from reasoning and researchGoal',
      `Try match=['name'] with concise terms for targeted name-based discovery`,
      'Remove owner restriction to explore broader ecosystem; narrow after identifying patterns',
    ],
  },

  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    hasResults: [
      `Turn discovered paths into targeted ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries (add extension filters)`,
      'Identify entry points, configs, and docs to guide next content fetches',
      'Focus on source directories for implementations and examples for usage',
      'Derive researchSuggestions for follow-up queries by area/module',
    ],
    empty: [
      'Start at repo root with depth=1; then increase depth as needed',
      'Omit branch to auto-detect default; try alternative branches if needed',
      `Validate existence via ${TOOL_NAMES.GITHUB_SEARCH_CODE} with match='path'`,
      'For monorepos, explore packages/apps/workspaces directories',
    ],
  },

  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    hasResults: [
      'Use matchString from search text_matches with appropriate context lines for clarity',
      'Prefer partial reads (startLine/endLine) over fullContent for token efficiency',
      'Specify branch when needed; omit for auto-detect default branch',
      'Set minified=false for JSON/MD/YAML when readability matters; keep sanitize=true for security',
      `Follow imports/exports to queue next ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries`,
    ],
    empty: [
      `Validate path via ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE} with match='path'`,
      'Try omitting branch for auto-detection or specify common branches (main/master/develop) explicitly',
      'Check for binary/large files; use line ranges for large files to avoid token limits',
      'Verify case-sensitive paths and correct repository layout structure',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: {
    hasResults: [
      'Filter state="closed" with merged=true for proven, production-ready implementations',
      'Enable withContent for diffs or withComments for discussion threads (both are token-expensive)',
      'Sort by created/updated; use limit to control result size based on research needs',
      'Filter by author/labels/reviewers to focus on specific domain expertise or team areas',
      `Extract changed filenames/functions and convert into targeted ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries`,
      `Use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} to examine specific files changed in PRs for implementation details`,
      'Bulk-query multiple PR searches with different filters to compare approaches',
    ],
    empty: [
      'Use direct prNumber mode when PR number is known (fastest approach)',
      'Relax filters progressively: remove state, labels, author, or merged status constraints',
      'Widen date ranges if created/updated filters are too restrictive',
      'Search by head/base branch names to find PRs related to specific workstreams',
      'Search across title/body/comments fields using keywords from researchGoal',
      'Try broader query terms or remove repo/owner constraints to discover cross-repo patterns',
      'Search for related issues or discussions if PRs are sparse',
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
