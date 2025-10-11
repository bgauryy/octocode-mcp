export const GENERAL = {
  base: {
    researchGoal: 'What you want to find or understand',
    reasoning: 'Why this query helps achieve the goal',
    suggestions:
      'Actionable next steps to explore based on expected findings from this query',
  },
};

export const COMMON = {
  scope: {
    owner: 'repo owner (e.g., "bgauryy")',
    repo: 'repo name (e.g., "octocode-mcp")',
    branch: 'Branch/tag/SHA',
    path: 'Directory/file path from repository root',
  },
  processing: {
    minify: 'Minify results for token efficiency',
    minified: 'Minify content for token efficiency',
    sanitize: 'Redact secrets and sensitive data',
  },
  filters: {
    stars: 'Stars filter (e.g., ">1000", "100..500", "<100")',
    created: 'Creation date (e.g., ">=2024-01-01")',
    updated: 'Last update date (e.g., ">=2024-06-01")',
    state: 'State filter: "open" or "closed"',
    extension: 'File extension without dot (e.g., ts, js, py)',
    filename: 'Filename substring (case-insensitive)',
  },
  users: {
    author: 'Creator/author of the content',
    assignee: 'Assigned user',
    commenter: 'User who commented',
    involves: 'User involved in any way',
    mentions: 'Mentions @user',
  },
  git: {
    head: 'Source branch',
    base: 'Target branch',
    merged: 'Merged status (boolean)',
    draft: 'Draft status (boolean)',
  },
  sorting: {
    sort: 'Sort criteria (varies by tool)',
    order: 'Order: desc (default) | asc',
  },
  resultLimit: {
    limit: 'Maximum number of results to return',
  },
  engagement: {
    comments: 'Comment count or range (e.g., ">5", "10..20")',
    reactions: 'Reaction count or range',
    interactions: 'Comments + reactions count or range',
  },
  dates: {
    closed: 'Closed date',
    'merged-at': 'Merged date',
  },
  labels: {
    label: 'Label filter (string or array, OR logic)',
    'no-label': 'No labels',
    'no-milestone': 'No milestone',
    'no-project': 'Not in a project',
    'no-assignee': 'No assignee',
  },
};

export const GITHUB_SEARCH_CODE = {
  search: {
    keywordsToSearch:
      'Specific terms to search for (AND logic). When match="file" (default): searches inside file content for code, functions, variables. When match="path": searches in file/directory names and paths. Prefer function/error/class names for content, file/folder names for paths',
  },
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
  },
  filters: {
    extension: COMMON.filters.extension,
    stars: COMMON.filters.stars,
    filename: COMMON.filters.filename,
    path: 'Folder substring to limit scope (e.g., "src/components")',
    match:
      'Where to search: "file" (content, default) or "path" (filenames/dirs). Use "path" to discover, then "file" to inspect',
  },
  resultLimit: {
    limit: 'Max results (1–20). Use small numbers for focused searches',
  },
  processing: {
    minify: COMMON.processing.minify,
    sanitize: COMMON.processing.sanitize,
  },
};

// GitHub repository search tool descriptions
export const GITHUB_SEARCH_REPOS = {
  search: {
    keywordsToSearch:
      'AND search across name/description/README. Use for functionality discovery',
    topicsToSearch:
      'Exact GitHub topic tags (e.g., ["typescript", "cli"]). Use for category discovery',
  },
  scope: {
    owner: COMMON.scope.owner,
  },
  filters: {
    stars: COMMON.filters.stars,
    size: 'Repo size in KB (e.g., ">1000", "<500")',
    created: COMMON.filters.created,
    updated: COMMON.filters.updated,
    match:
      'Fields to search (OR): ["name"|"description"|"readme"]. Default: all',
  },
  sorting: {
    sort: 'Sort by: stars | forks | updated | best-match',
  },
  resultLimit: {
    limit: 'Max repositories (1–20)',
  },
};

// GitHub pull request search tool descriptions
export const GITHUB_SEARCH_PULL_REQUESTS = {
  search: {
    query: 'Text query across PR title, body, comments',
  },
  scope: {
    prNumber: 'Direct PR number (fastest way to fetch a single PR)',
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
  },
  filters: {
    state: COMMON.filters.state,
    assignee: COMMON.users.assignee,
    author: COMMON.users.author,
    commenter: COMMON.users.commenter,
    involves: COMMON.users.involves,
    mentions: COMMON.users.mentions,
    'review-requested': 'Requested reviewer',
    'reviewed-by': 'User who reviewed',
    label: COMMON.labels.label,
    'no-label': COMMON.labels['no-label'],
    'no-milestone': COMMON.labels['no-milestone'],
    'no-project': COMMON.labels['no-project'],
    'no-assignee': COMMON.labels['no-assignee'],
    head: COMMON.git.head,
    base: COMMON.git.base,
    created: 'Creation date (e.g., ">=2024-01-01", "2024-01-01..2024-03-31")',
    updated: 'Last update date',
    closed: COMMON.dates.closed,
    'merged-at': COMMON.dates['merged-at'],
    comments: COMMON.engagement.comments,
    reactions: COMMON.engagement.reactions,
    interactions: COMMON.engagement.interactions,
    merged: COMMON.git.merged,
    draft: COMMON.git.draft,
    match: 'Fields to search (OR): ["title"|"body"|"comments"]. Default: all',
  },
  sorting: {
    sort: 'Sort by: created | updated | best-match',
    order: COMMON.sorting.order,
  },
  resultLimit: {
    limit: 'Max PRs (1–100, default 30)',
  },
  outputShaping: {
    withComments: 'Include comment threads (token expensive)',
    withContent: 'Include diffs/changes (very token expensive)',
  },
};

// GitHub file content fetch tool descriptions
export const GITHUB_FETCH_CONTENT = {
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
    branch: 'Branch/tag/SHA (optional; auto-fallback to default branch)',
    path: 'Full file path from repo root (validate path first)',
  },
  processing: {
    minified: COMMON.processing.minified,
    sanitize: COMMON.processing.sanitize,
  },
  range: {
    startLine: 'Start line for partial read (requires endLine)',
    endLine: 'End line for partial read (requires startLine)',
    fullContent: 'Return entire file (token expensive for large files)',
    matchString: 'Pattern to find within the file',
    matchStringContextLines:
      'Lines of context around matches (0–50, default 5)',
  },
};

// GitHub repository structure view tool descriptions
export const GITHUB_VIEW_REPO_STRUCTURE = {
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
    branch: COMMON.scope.branch,
    path: 'Directory path (default "" for root)',
  },
  range: {
    depth:
      'Depth: 1 (current directory) or 2 (include subdirectories). Default: 1',
  },
};
