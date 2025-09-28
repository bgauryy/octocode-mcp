export const SCHEME_DESCRIPTIONS_STRUCTURED = {
  GENERAL: {
    base: {
      id: 'queryId',
      reasoning: 'Reasoning: Explain your research goal',
    },
  },
  GITHUB_SEARCH_CODE: {
    search: {
      keywordsToSearch: 'Search: keywords in file (AND logic)',
    },
    scope: {
      owner: 'Scope: Repository owner',
      repo: 'Scope: Repository name',
    },
    filters: {
      language: 'Filter: Programming language', // REMOVE
      extension: 'Filter: File extension',
      stars: 'Filter: Stars (e.g., ">100", ">=1000")',
      filename: `Filter: by filename patterns (e.g., "*.js", "*.tsx", "App.js")`,
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
  },
  GITHUB_SEARCH_REPOS: {
    search: {
      keywordsToSearch: 'Search: keywords',
      topicsToSearch: 'Search: topics',
    },
    scope: {
      owner: 'Scope: Repository owner',
    },
    filters: {
      language: 'Filter: Programming language', // REMOVE
      stars: 'Filter: stars (e.g., ">100", ">=1000")',
      size: 'Filter: repository size filter in KB (e.g., ">1000", "<500")',
      created: 'Filter: Creation date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)',
      updated: 'Filter: Last update date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)',
      match:
        'Filter: Restricts search scope - filters WHERE to search: "name" (repository names only), "description" (description field only), "readme" (README files only). Combinations work as OR. Default (no match) searches ALL fields. Use to reduce noise and focus results.',
    },
    sorting: {
      sort: 'Sort: results by: "forks", "stars", "updated" (last update), "best-match" (relevance)', // REMOVE -  move to code
    },
    resultLimit: {
      limit: 'ResultLimit: maximum number of results to return from search',
    },
  },
  GITHUB_SEARCH_PULL_REQUESTS: {
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
      involves: 'Filter:User involved in any way', //REMOVE
      mentions: 'PRs mentioning this user', // REMOVE
      'review-requested': 'User/team requested for review',
      'reviewed-by': 'User who reviewed the PR',
      'team-mentions': 'Team mentions (@org/team-name)',
      label: 'Filter: Labels. Single label or array for OR logic',
      'no-label': 'PRs without labels',
      milestone: 'Filter: Milestone title',
      'no-milestone': 'Filter: PRs without milestones',
      project: 'Filter: Project board owner/number',
      'no-project': 'PRs not in projects',
      'no-assignee': 'PRs without assignees',
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
      locked: 'Filter: Locked PR state', // REMOVE
      language: 'Filter: Programming language', // REMOVE
      visibility: 'Repository visibility', // REMOVE
      app: 'GitHub App author', // REMOVE
      match: 'Filter: Search scope',
    },
    sorting: {
      sort: 'Sort" results', //CHECK
      order: 'Sort: order (asc/desc)', //CHECK
    },
    resultLimit: {
      limit: 'ResultLimit: maximum number of results to return from search',
    },
    outputShaping: {
      withComments: 'OutputShaping: include full comment content in results',
      getFileChanges: 'OutputShaping: include file changes/diffs in results',
    },
  },
  GITHUB_FETCH_CONTENT: {
    scope: {
      owner: 'Scope: Repository owner',
      repo: 'Scope: Repository name',
      branch: 'Scope: Branch/tag/SHA',
      path: 'Scope: File path - absolute path',
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
  },
  GITHUB_VIEW_REPO_STRUCTURE: {
    scope: {
      owner: 'Scope: Repository owner',
      repo: 'Scope: Repository name',
      branch: 'Scope: Branch/tag/SHA',
      path: 'Scope: File path',
    },
    range: {
      depth: 'Range: depth to explore (1-2)',
    },
  },
};
