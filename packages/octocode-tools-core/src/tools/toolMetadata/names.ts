import { STATIC_TOOL_NAMES } from '@octocodeai/octocode-core/schema';

export const TOOL_NAMES = {
  ...STATIC_TOOL_NAMES,
  // Internal engines retained behind the unified public contracts.
  GITHUB_SEARCH_CODE: 'github.code',
  GITHUB_VIEW_REPO_STRUCTURE: 'github.tree',
  GITHUB_SEARCH_REPOSITORIES: 'github.repositories',
  LOCAL_RIPGREP: 'local.text',
} as const;
