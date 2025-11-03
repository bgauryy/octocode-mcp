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
    stars:
      'Stars filter with comparison operators (e.g., ">500", "100..500", "<50")',
    created:
      'Creation date filter (format: ">=YYYY-MM-DD" or "YYYY-MM-DD..YYYY-MM-DD")',
    updated: 'Last update date filter (format: ">=YYYY-MM-DD")',
    state: 'State filter: "open" or "closed"',
    extension: 'File extension without dot (e.g., ts, js, py)',
    filename: 'Filename pattern for case-insensitive substring matching',
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
    comments:
      'Comment count filter with comparison operators (e.g., ">5", "10..20")',
    reactions: 'Reaction count filter with comparison operators',
    interactions: 'Combined comments and reactions count filter',
  },
  dates: {
    closed: 'Closed date filter (format: ">=YYYY-MM-DD")',
    'merged-at': 'Merged date filter (format: ">=YYYY-MM-DD")',
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
      'Search terms applied with AND logic. Behavior depends on match parameter: match="file" searches file content and returns text_matches[], match="path" searches file/directory names only',
  },
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
  },
  filters: {
    extension: COMMON.filters.extension,
    stars: COMMON.filters.stars,
    filename: COMMON.filters.filename,
    path: 'Directory path to limit search scope (e.g., "src/components")',
    match:
      'Search mode: "file" (searches content, default) or "path" (searches filenames/directories)',
  },
  resultLimit: {
    limit: 'Maximum results to return',
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
      'Keywords applied with AND logic across repository name, description, and README',
    topicsToSearch:
      'Exact GitHub topic tags for curated search (e.g., ["typescript", "cli"])',
  },
  scope: {
    owner: COMMON.scope.owner,
  },
  filters: {
    stars: COMMON.filters.stars,
    size: 'Repository size in KB with comparison operators (e.g., ">1000", "<500")',
    created: COMMON.filters.created,
    updated: COMMON.filters.updated,
    match:
      'Fields to search (OR logic): ["name"|"description"|"readme"]. Default: all fields',
  },
  sorting: {
    sort: 'Sort by: stars | forks | updated | best-match',
  },
  resultLimit: {
    limit: 'Maximum repositories to return',
  },
};

// GitHub pull request search tool descriptions
export const GITHUB_SEARCH_PULL_REQUESTS = {
  search: {
    query: 'Free-text search query across PR title, body, and comments',
  },
  scope: {
    prNumber: 'Direct PR number for fetching specific PR',
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
    'review-requested': 'User requested as reviewer',
    'reviewed-by': 'User who reviewed the PR',
    label: COMMON.labels.label,
    'no-label': COMMON.labels['no-label'],
    'no-milestone': COMMON.labels['no-milestone'],
    'no-project': COMMON.labels['no-project'],
    'no-assignee': COMMON.labels['no-assignee'],
    head: COMMON.git.head,
    base: COMMON.git.base,
    created: COMMON.filters.created,
    updated: COMMON.filters.updated,
    closed: COMMON.dates.closed,
    'merged-at': COMMON.dates['merged-at'],
    comments: COMMON.engagement.comments,
    reactions: COMMON.engagement.reactions,
    interactions: COMMON.engagement.interactions,
    merged: 'Merged status (boolean). Requires state="closed"',
    draft: COMMON.git.draft,
    match:
      'Fields to search (OR logic): ["title"|"body"|"comments"]. Default: all fields',
  },
  sorting: {
    sort: 'Sort by: created | updated | best-match',
    order: COMMON.sorting.order,
  },
  resultLimit: {
    limit: 'Maximum PRs to return',
  },
  outputShaping: {
    withComments: 'Include comment threads and discussions (token expensive)',
    withContent: 'Include code diffs and file changes (very token expensive)',
  },
};

// GitHub file content fetch tool descriptions
export const GITHUB_FETCH_CONTENT = {
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
    branch:
      'Branch, tag, or SHA (optional; defaults to repository default branch)',
    path: 'Full file path from repository root',
  },
  processing: {
    minified: COMMON.processing.minified,
    sanitize: COMMON.processing.sanitize,
  },
  range: {
    startLine: 'Start line number for partial read (requires endLine)',
    endLine: 'End line number for partial read (requires startLine)',
    fullContent: 'Return entire file content (token expensive for large files)',
    matchString: 'Search pattern to extract matching sections with context',
    matchStringContextLines:
      'Lines of context around matchString matches (max: 50)',
  },
};

// GitHub repository structure view tool descriptions
export const GITHUB_VIEW_REPO_STRUCTURE = {
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
    branch: COMMON.scope.branch,
    path: 'Directory path to explore (empty string or omit for root directory)',
  },
  range: {
    depth:
      'Exploration depth: 1 (current directory only) or 2 (includes subdirectories). Default: 1',
  },
};
