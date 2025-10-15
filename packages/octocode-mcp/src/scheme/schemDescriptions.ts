export const GENERAL = {
  base: {
    researchGoal: 'What you want to find or understand',
    reasoning: 'Why this query helps achieve the goal',
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
    created:
      'Creation date filter (e.g., ">=YYYY-MM-DD", "YYYY-MM-DD..YYYY-MM-DD")',
    updated: 'Last update date filter (e.g., ">=YYYY-MM-DD")',
    state: 'State filter: "open" or "closed"',
    extension:
      'File extension without dot (e.g., ts, js, py) - filters content search to specific file types',
    filename:
      'Filename pattern (case-insensitive) - filters content search to files matching this substring in their name',
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
      'Specific terms to search for (AND logic). When match="file" (default): searches inside file content for code, functions, variables - returns paths WITH text_matches[]. When match="path": searches in file/directory names only - returns paths WITHOUT text_matches. Prefer function/class/error names for content search, file/folder names for path discovery',
  },
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
  },
  filters: {
    extension: COMMON.filters.extension,
    stars: COMMON.filters.stars,
    filename: COMMON.filters.filename,
    path: 'Directory path to limit content search scope (e.g., "src/components" searches only in that folder)',
    match:
      'Search mode: "file" (search IN content, default) or "path" (search file/directory names). Use "path" for discovery, "file" for implementation details',
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
      'Keywords for AND search across repository name/description/README. Use for finding repos with specific functionality or technology',
    topicsToSearch:
      'Exact GitHub topic tags (e.g., ["typescript", "cli"]). Use for category-based discovery of curated repositories',
  },
  scope: {
    owner: COMMON.scope.owner,
  },
  filters: {
    stars: COMMON.filters.stars,
    size: 'Repository size in KB (e.g., ">1000", "<500") - useful for finding lightweight utilities or substantial projects',
    created: COMMON.filters.created,
    updated: COMMON.filters.updated,
    match:
      'Fields to search in (OR logic): ["name"|"description"|"readme"]. Default: searches all fields',
  },
  sorting: {
    sort: 'Sort by: stars (popularity) | forks (activity) | updated (recency) | best-match (relevance)',
  },
  resultLimit: {
    limit: 'Max repositories (1–20)',
  },
};

// GitHub pull request search tool descriptions
export const GITHUB_SEARCH_PULL_REQUESTS = {
  search: {
    query:
      'Free-text search query across PR title, body, and comments - use for finding PRs discussing specific topics or issues',
  },
  scope: {
    prNumber:
      'Direct PR number for fetching a specific PR (fastest method, bypasses search)',
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
    created:
      'Creation date filter (e.g., ">=YYYY-MM-DD", "YYYY-MM-DD..YYYY-MM-DD") - useful for recent PRs or date ranges',
    updated: 'Last update date filter - useful for finding recently active PRs',
    closed: COMMON.dates.closed,
    'merged-at': COMMON.dates['merged-at'],
    comments: COMMON.engagement.comments,
    reactions: COMMON.engagement.reactions,
    interactions: COMMON.engagement.interactions,
    merged:
      'Merged status (boolean) - use merged=true with state="closed" to find production code changes',
    draft: COMMON.git.draft,
    match:
      'Fields to search query in (OR logic): ["title"|"body"|"comments"]. Default: searches all fields',
  },
  sorting: {
    sort: 'Sort by: created (newest first) | updated (most recent activity) | best-match (most relevant to query)',
    order: COMMON.sorting.order,
  },
  resultLimit: {
    limit:
      'Max PRs to return (1-10, default 5) - use lower numbers for focused analysis',
  },
  outputShaping: {
    withComments:
      'Include full comment threads and discussions (token expensive but useful for understanding PR context and decisions)',
    withContent:
      'Include code diffs and file changes (very token expensive but essential for implementation analysis)',
  },
};

// GitHub file content fetch tool descriptions
export const GITHUB_FETCH_CONTENT = {
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
    branch:
      'Branch/tag/SHA (optional; automatically falls back to default branch if not specified)',
    path: 'Full file path from repository root (validate with githubViewRepoStructure or githubSearchCode before fetching)',
  },
  processing: {
    minified: COMMON.processing.minified,
    sanitize: COMMON.processing.sanitize,
  },
  range: {
    startLine:
      'Start line number for partial read (must use with endLine) - efficient for reading specific sections',
    endLine:
      'End line number for partial read (must use with startLine) - efficient for reading specific sections',
    fullContent:
      'Return entire file content (token expensive for large files, use partial reads when possible)',
    matchString:
      'Search pattern to find within the file - returns only matching sections with context (most efficient for targeted reads)',
    matchStringContextLines:
      'Lines of context to show around each match (1-50, default 5) - use with matchString for focused content retrieval',
  },
};

// GitHub repository structure view tool descriptions
export const GITHUB_VIEW_REPO_STRUCTURE = {
  scope: {
    owner: COMMON.scope.owner,
    repo: COMMON.scope.repo,
    branch: COMMON.scope.branch,
    path: 'Directory path to explore (use "" or omit for root directory) - helps navigate to specific folders',
  },
  range: {
    depth:
      'Exploration depth: 1 (current directory only - shows immediate files/folders) or 2 (includes subdirectories - shows nested structure). Default: 1',
  },
};
