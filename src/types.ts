// Re-export schema types
export {
  PackageSearchResult,
  PackageSearchError,
  BasicPackageSearchResult,
} from './mcp/tools/scheme/package_search';

export interface GitHubCommitSearchParams {
  // Research goal for LLM reasoning
  researchGoal?: string;

  // Query types - use one of these
  queryTerms?: string[]; // Array of search terms (AND logic)
  orTerms?: string[]; // Array of search terms (OR logic)

  // Repository filters
  owner?: string; // Repository owner
  repo?: string; // Repository name

  // Author filters
  author?: string; // GitHub username
  'author-name'?: string; // Full name of author
  'author-email'?: string; // Email address of author

  // Committer filters
  committer?: string; // GitHub username
  'committer-name'?: string; // Full name of committer
  'committer-email'?: string; // Email address of committer

  // Date filters
  'author-date'?: string; // When authored
  'committer-date'?: string; // When committed

  // Hash filters
  hash?: string; // Commit SHA (full or partial)
  parent?: string; // Parent commit SHA
  tree?: string; // Tree SHA

  // Merge filter
  merge?: boolean; // Only merge commits (true) or exclude them (false)

  // Visibility filter
  visibility?: 'public' | 'private' | 'internal';

  // EXPENSIVE OPTIONS - Custom functionality
  getChangesContent?: boolean; // Fetch diff/patch content for each commit. WARNING: EXTREMELY expensive in tokens.

  // PAGINATION CONTROL - Custom functionality
  exhaustive?: boolean; // Enable exhaustive pagination to get ALL results
  maxPages?: number; // Maximum pages to fetch (safety limit)
  pageSize?: number; // Items per page (default: 100, max: 100)

  // Base search parameters
  limit?: number;

  // Sort parameters
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface GitHubPullRequestsSearchParams {
  // Research goal for LLM reasoning
  researchGoal?: string;

  // CORE SEARCH - Query is optional, you can search with filters only
  query?: string;

  // REPOSITORY FILTERS - Direct CLI flag mappings
  owner?: string | string[]; // Repository owner/organization name(s) (--owner)
  repo?: string | string[]; // Repository name(s) (--repo)

  // STATE FILTERS - Direct CLI flag mappings
  state?: 'open' | 'closed'; // Pull request state (--state)
  draft?: boolean; // Include draft pull requests (--draft)
  merged?: boolean; // Include merged pull requests (--merged)
  locked?: boolean; // Include locked pull requests (--locked)

  // USER INVOLVEMENT FILTERS - Direct CLI flag mappings
  author?: string; // Pull request author (--author)
  assignee?: string; // Pull request assignee (--assignee)
  mentions?: string; // User mentioned in pull request (--mentions)
  commenter?: string; // User who commented on pull request (--commenter)
  involves?: string; // User involved in pull request (--involves)
  'reviewed-by'?: string; // User who reviewed the pull request (--reviewed-by)
  'review-requested'?: string; // User requested for review (--review-requested)

  // BRANCH FILTERS - Direct CLI flag mappings
  head?: string; // Head branch name (--head)
  base?: string; // Base branch name (--base)

  // DATE FILTERS - Direct CLI flag mappings
  created?: string; // Creation date filter (--created)
  updated?: string; // Last updated date filter (--updated)
  'merged-at'?: string; // Merge date filter (--merged)
  closed?: string; // Close date filter (--closed)

  // ENGAGEMENT FILTERS - Direct CLI flag mappings
  comments?: number | string; // Number of comments filter (--comments)
  reactions?: number | string; // Number of reactions filter (--reactions)
  interactions?: number | string; // Number of interactions filter (--interactions)

  // REVIEW & CI FILTERS - Direct CLI flag mappings
  review?: 'none' | 'required' | 'approved' | 'changes_requested'; // Review status (--review)
  checks?: 'pending' | 'success' | 'failure'; // CI/CD check status (--checks)

  // LABEL & ORGANIZATION FILTERS - Direct CLI flag mappings
  label?: string | string[]; // Label names (--label)
  milestone?: string; // Milestone name (--milestone)
  project?: string; // Project board number (--project)
  'team-mentions'?: string; // Team mentioned (@org/team-name) (--team-mentions)

  // BOOLEAN "MISSING" FILTERS - Direct CLI flag mappings
  'no-assignee'?: boolean; // Pull requests without assignee (--no-assignee)
  'no-label'?: boolean; // Pull requests without labels (--no-label)
  'no-milestone'?: boolean; // Pull requests without milestone (--no-milestone)
  'no-project'?: boolean; // Pull requests not in projects (--no-project)

  // ADDITIONAL FILTERS - Direct CLI flag mappings
  language?: string; // Repository language filter (--language)
  visibility?:
    | 'public'
    | 'private'
    | 'internal'
    | ('public' | 'private' | 'internal')[]; // Repository visibility (--visibility)
  app?: string; // GitHub App that created the pull request (--app)
  archived?: boolean; // Include archived repositories (--archived)

  match?: ('title' | 'body' | 'comments')[]; // Restrict search to specific fields (--match)

  // RESULT CONTROL - Direct CLI flag mappings
  limit?: number; // Maximum number of results to fetch (--limit)
  sort?:
    | 'comments'
    | 'reactions'
    | 'reactions-+1'
    | 'reactions--1'
    | 'reactions-smile'
    | 'reactions-thinking_face'
    | 'reactions-heart'
    | 'reactions-tada'
    | 'interactions'
    | 'created'
    | 'updated'; // Sort fetched results (--sort)
  order?: 'asc' | 'desc'; // Order of results, requires --sort (--order)

  // EXPENSIVE OPTIONS - Custom functionality
  getCommitData?: boolean; // Set to true to fetch all commits in the PR with their changes. Shows commit messages, authors, and file changes. WARNING: EXTREMELY expensive in tokens - fetches diff/patch content for each commit.
  withComments?: boolean; // Include full comment content in search results. WARNING: EXTREMELY expensive in tokens and should be used with caution. Recommended to not use unless specifically needed.

  // PAGINATION CONTROL - Custom functionality
  exhaustive?: boolean; // Enable exhaustive pagination to get ALL results
  maxPages?: number; // Maximum pages to fetch (safety limit)
  pageSize?: number; // Items per page (default: 100, max: 100)
}
export interface GitHubDiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface GitHubPullRequestDiff {
  changed_files: number;
  additions: number;
  deletions: number;
  files: GitHubDiffFile[];
}

export interface GitHubCommitDiff {
  changed_files: number;
  additions: number;
  deletions: number;
  total_changes: number;
  files: GitHubDiffFile[];
}

export interface GitHubPullRequestComment {
  id: string;
  author: {
    login: string;
  };
  authorAssociation: string;
  body: string;
  createdAt: string;
  includesCreatedEdit: boolean;
  isMinimized: boolean;
  minimizedReason: string;
  reactionGroups: any[];
  url: string;
  viewerDidAuthor: boolean;
}

export interface GitHubPullRequestItem {
  number: number;
  title: string;
  body?: string; // PR description/body content
  state: 'open' | 'closed';
  author: string;
  repository: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  merged_at?: string;
  closed_at?: string;
  url: string;
  comments?: GitHubPullRequestComment[]; // Full comment content (only when withComments=true)
  reactions: number;
  draft: boolean;
  head?: string;
  base?: string;
  head_sha?: string; // Commit SHA for the head branch
  base_sha?: string; // Commit SHA for the base branch
  diff?: GitHubPullRequestDiff; // Code changes when getChangesContent=true
  commits?: {
    total_count: number;
    commits: Array<{
      sha: string;
      message: string;
      author: string;
      url: string;
      authoredDate?: string;
      diff?: {
        changed_files: number;
        additions: number;
        deletions: number;
        total_changes: number;
        files: GitHubDiffFile[];
      };
      _sanitization_warnings?: string[]; // Optional sanitization warnings
    }>;
  };
  _sanitization_warnings?: string[]; // Optional sanitization warnings
}

export interface GitHubPullRequestsSearchResult {
  results: GitHubPullRequestItem[];
  total_count: number;
  // Add pagination metadata
  pagination?: {
    exhaustive: boolean;
    pages_fetched: number;
    total_pages_estimated?: number;
    has_more: boolean;
    rate_limit_hit?: boolean;
  };
}
export interface NpmPackage {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  links?: {
    repository?: string;
  };
}

export interface PythonPackage {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
}

// GitHub Search Code Types
export interface GitHubCodeSearchItem {
  path: string;
  repository: {
    id: string;
    nameWithOwner: string;
    url: string;
    isFork: boolean;
    isPrivate: boolean;
  };
  sha: string;
  url: string;
  textMatches?: Array<{
    fragment: string;
    matches: Array<{
      text: string;
      indices: [number, number];
    }>;
  }>;
}

export interface OptimizedCodeSearchResult {
  items: Array<{
    path: string;
    matches: Array<{
      context: string;
      positions: [number, number][];
    }>;
    url: string;
    repository: {
      nameWithOwner: string;
      url: string;
    };
  }>;
  total_count: number;
  repository?: {
    name: string;
    url: string;
  };
  securityWarnings?: string[];
  minified?: boolean;
  minificationFailed?: boolean;
  minificationTypes?: string[];
  _researchContext?: {
    foundPackages: string[];
    foundFiles: string[];
    repositoryContext?: {
      owner: string;
      repo: string;
    };
  };
}

// GitHub Search Commits Types
export interface GitHubCommitSearchItem {
  sha: string;
  commit?: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
  };
  author?: {
    login: string;
    id: number;
    type: string;
    url: string;
  };
  committer?: {
    login: string;
    id: number;
    type: string;
    url: string;
  };
  repository: {
    name: string;
    fullName: string;
    url: string;
    description?: string;
  };
  url: string;
  parents?: Array<{
    sha: string;
    url: string;
  }>;
}

// Optimized commit search response
export interface OptimizedCommitSearchResult {
  commits: Array<{
    sha: string; // Full SHA hash
    message: string; // First line only
    author: string; // Just name
    date: string; // Relative time
    repository?: string; // owner/repo (only for multi-repo)
    url: string; // SHA or repo@SHA
    diff?: GitHubCommitDiff; // Code changes when getChangesContent=true
    _sanitization_warnings?: string[]; // Optional sanitization warnings
  }>;
  total_count: number;
  repository?: {
    name: string;
    description?: string;
  };
  // Add pagination metadata
  pagination?: {
    exhaustive: boolean;
    pages_fetched: number;
    total_pages_estimated?: number;
    has_more: boolean;
    rate_limit_hit?: boolean;
  };
}

// NPM Package Types - Optimized
export interface OptimizedNpmPackageResult {
  name: string;
  version: string;
  description: string;
  license: string;
  repository: string;
  size: string;
  created: string;
  updated: string;
  versions: Array<{
    version: string;
    date: string;
  }>;
  stats: {
    total_versions: number;
    weekly_downloads?: number;
  };
  exports?: { main: string; types?: string; [key: string]: unknown };
}

export type CallToolResult = {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError: boolean;
};

export interface GitHubIssuesSearchParams {
  // Research goal for LLM reasoning
  researchGoal?: string;

  // CORE SEARCH
  query: string; // Search query for issue content

  // REPOSITORY FILTERS
  owner?: string; // Repository owner/organization name
  repo?: string; // Repository name

  // STATE FILTERS
  state?: 'open' | 'closed'; // Issue state
  locked?: boolean; // Conversation locked status

  // USER INVOLVEMENT FILTERS
  author?: string; // Issue author
  assignee?: string; // Issue assignee
  mentions?: string; // User mentioned in issue
  commenter?: string; // User who commented on issue
  involves?: string; // User involved in any way

  // DATE FILTERS
  created?: string; // Creation date filter
  updated?: string; // Last updated date filter
  closed?: string; // Close date filter

  // ENGAGEMENT FILTERS
  comments?: number | string; // Number of comments filter
  reactions?: number | string; // Number of reactions filter
  interactions?: number | string; // Total interactions filter

  // LABEL & ORGANIZATION FILTERS
  label?: string | string[]; // Label names
  milestone?: string; // Milestone name
  'team-mentions'?: string; // Team mentioned (@org/team-name)

  // BOOLEAN "MISSING" FILTERS
  'no-assignee'?: boolean; // Issues without assignee
  'no-label'?: boolean; // Issues without labels
  'no-milestone'?: boolean; // Issues without milestone
  'no-project'?: boolean; // Issues not in projects

  // ADDITIONAL FILTERS
  language?: string; // Repository language filter
  visibility?: 'public' | 'private' | 'internal'; // Repository visibility
  app?: string; // GitHub App that created the issue
  archived?: boolean; // Include archived repositories

  // SEARCH SCOPE
  match?: 'title' | 'body' | 'comments'; // Restrict search to specific fields

  // RESULT CONTROL
  limit?: number; // Maximum number of results to fetch
  sort?:
    | 'comments'
    | 'created'
    | 'interactions'
    | 'reactions'
    | 'reactions-+1'
    | 'reactions--1'
    | 'reactions-heart'
    | 'reactions-smile'
    | 'reactions-tada'
    | 'reactions-thinking_face'
    | 'updated'
    | 'best-match'; // Sort results
  order?: 'asc' | 'desc'; // Order of results

  // OPTIONS
  'include-prs'?: boolean; // Include pull requests in results

  // PAGINATION CONTROL - Custom functionality
  exhaustive?: boolean; // Enable exhaustive pagination to get ALL results
  maxPages?: number; // Maximum pages to fetch (safety limit)
  pageSize?: number; // Items per page (default: 100, max: 100)
}

export interface GitHubIssueItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: {
    login: string;
    id?: string;
    url?: string;
    type?: string;
    is_bot?: boolean;
  };
  authorAssociation?: string;
  body?: string;
  closedAt?: string;
  commentsCount?: number;
  createdAt: string;
  id?: string;
  isLocked?: boolean;
  isPullRequest?: boolean;
  labels: Array<{
    name: string;
    color?: string;
    description?: string;
    id?: string;
  }>;
  assignees?: Array<{
    login: string;
    id?: string;
    url?: string;
    type?: string;
    is_bot?: boolean;
  }>;
  repository: {
    name: string;
    nameWithOwner: string;
  };
  url: string;
  updatedAt: string;
  // Keep legacy fields for compatibility
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  comments?: number;
  reactions?: number;
  _sanitization_warnings?: string[]; // Optional sanitization warnings
}

export interface GitHubIssuesSearchResult {
  results: GitHubIssueItem[];
  // Add pagination metadata
  pagination?: {
    exhaustive: boolean;
    pages_fetched: number;
    total_pages_estimated?: number;
    has_more: boolean;
    rate_limit_hit?: boolean;
  };
}

// Enhanced Package Search Types - Merged npm_view_package functionality
export interface EnhancedPackageMetadata {
  gitURL: string;
  metadata: OptimizedNpmPackageResult | PythonPackageMetadata;
}

export interface PythonPackageMetadata {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  // Additional Python-specific metadata can be added here
  homepage?: string;
  author?: string;
  license?: string;
}

export interface NpmPackageQuery {
  name: string; // Package name to search for
  searchLimit?: number; // Results limit per query (1-50)
  npmSearchStrategy?: 'individual' | 'combined'; // Search strategy
  npmFetchMetadata?: boolean; // Whether to fetch detailed metadata
  npmField?: string; // Specific field to retrieve
  npmMatch?: string | string[]; // Specific field(s) to retrieve
  id?: string; // Optional identifier for the query
}

export interface PythonPackageQuery {
  name: string; // Package name to search for
  searchLimit?: number; // Results limit for this query (1-10)
  id?: string; // Optional identifier for the query
}

export interface PackageSearchBulkParams {
  npmPackages?: NpmPackageQuery[]; // Array of NPM package queries
  pythonPackages?: PythonPackageQuery[]; // Array of Python package queries
  // Global defaults (can be overridden per query)
  searchLimit?: number;
  npmSearchStrategy?: 'individual' | 'combined';
  npmFetchMetadata?: boolean;
  researchGoal?: string; // Research goal to guide tool behavior and hint generation
}
