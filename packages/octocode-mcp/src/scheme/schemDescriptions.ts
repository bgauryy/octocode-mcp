// General schema descriptions used across all tools
export const GENERAL = {
  base: {
    researchGoal: 'ResearchGoal: the goal for the research',
    reasoning: 'Reasoning: Explain how the query will help the researchGoal',
  },
};

// GitHub code search tool descriptions
export const GITHUB_SEARCH_CODE = {
  search: {
    keywordsToSearch: 'Search: keywords in file (AND logic)',
  },
  scope: {
    owner: 'Scope: Repository owner',
    repo: 'Scope: Repository name',
  },
  filters: {
    extension: 'Filter: File extension',
    stars: 'Filter: Stars (e.g., ">100", ">=1000")',
    filename: `Filter: by filename using substring matching (e.g., ".test.js", "index.js", "App"). No wildcards supported`,
    path: 'Filter: search results by file/directory path (e.g., "src/components", "README.md")',
    match:
      'Filter: WHERE to search for keywords: "file" (default - searches in content) or "path" (searches in filenames/paths)',
  },
  resultLimit: {
    limit: 'ResultLimit: maximum number of results to return from search',
  },
  processing: {
    minify: 'Processing: minify content',
    sanitize: 'Processing: sanitize content',
  },
};

// GitHub repository search tool descriptions
export const GITHUB_SEARCH_REPOS = {
  search: {
    keywordsToSearch: 'Search: keywords',
    topicsToSearch: 'Search: by categories / github topics',
  },
  scope: {
    owner: 'Scope: Repository owner',
  },
  filters: {
    stars: 'Filter: stars (e.g., ">100", ">=1000")',
    size: 'Filter: repository size filter in KB (e.g., ">1000", "<500")',
    created: 'Filter: Creation date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)',
    updated: 'Filter: Last update date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)',
    match:
      'Filter: search scope). "name" - repo names, "description" - repo description, "readme" - repo README. Combinations work as OR. Default (no match) searches ALL fields',
  },
  sorting: {
    sort: 'Sort: results by: "forks", "stars", "updated" , "best-match"',
  },
  resultLimit: {
    limit: 'ResultLimit: maximum number of results to return from search',
  },
};

// GitHub pull request search tool descriptions
export const GITHUB_SEARCH_PULL_REQUESTS = {
  search: {
    query: 'Search: query for content',
  },
  scope: {
    prNumber: 'Scope: PR number to fetch',
    owner: 'Scope: Repository owner',
    repo: 'Scope: Repository name',
  },
  filters: {
    state: 'Filter: PR state: "open" or "closed"',
    assignee: 'Filter: username of assignee',
    author: 'Filter: username of PR author',
    commenter: 'Filter: user who commented on PR',
    involves: 'Filter: User involved in any way',
    mentions: 'Filter: PRs mentioning this user',
    'review-requested': 'Filter: User/team requested for review',
    'reviewed-by': 'Filter: User who reviewed the PR',
    label: 'Filter: Labels. Single label or array for OR logic',
    'no-label': 'Filter: PRs without labels',
    'no-milestone': 'Filter: PRs without milestones',
    'no-project': 'Filter: PRs not in projects',
    'no-assignee': 'Filter: PRs without assignees',
    head: 'Filter: head branch name',
    base: 'Filter: base branch name',
    created: 'Filter: Creation date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)',
    updated: 'Filter: Last update date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)',
    closed: 'Filter: Closed date',
    'merged-at': 'Filter: Merged date',
    comments: 'Filter: Comment count',
    reactions: 'Filter: Reaction count',
    interactions: 'Filter: Total interactions (reactions + comments)',
    merged: 'Filter: Merged state',
    draft: 'Filter: Draft PR state',
    match: 'Filter: Search scope (title, body, comments)',
  },
  sorting: {
    sort: 'Sort: results by (created, updated, best-match)',
    order: 'Sort: order (asc/desc)',
  },
  resultLimit: {
    limit: 'ResultLimit: maximum number of results to return from search',
  },
  outputShaping: {
    withComments: 'OutputShaping: include full comment content in results',
    withContent: 'OutputShaping: include PR changes in results',
  },
};

// GitHub file content fetch tool descriptions
export const GITHUB_FETCH_CONTENT = {
  scope: {
    owner: 'Scope: Repository owner',
    repo: 'Scope: Repository name',
    branch: 'Scope: Branch/tag/SHA',
    path: 'Scope: File path - absolute path from repo root. DO NOT HALLUCINATE',
  },
  processing: {
    minified: 'Processing: minify content',
    sanitize: 'Processing: sanitize content',
  },
  range: {
    startLine: 'Range: start line in file (requires endLine)',
    endLine: 'Range: end line in file (requires startLine)',
    fullContent: 'Range: return entire file',
    matchString:
      'Range: Search: pattern to search in file (requires matchString)',
    matchStringContextLines: 'Range: lines before and after matchString',
  },
};

// GitHub repository structure view tool descriptions
export const GITHUB_VIEW_REPO_STRUCTURE = {
  scope: {
    owner: 'Scope: Repository owner',
    repo: 'Scope: Repository name',
    branch: 'Scope: Branch/tag/SHA',
    path: 'Scope: File path',
  },
  range: {
    depth: 'Range: depth to explore (1-2)',
  },
};
