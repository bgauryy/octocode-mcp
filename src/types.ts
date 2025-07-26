export type BaseSearchParams = {
  query?: string;
  owner?: string | string[]; // Support both single and multiple owners
  repo?: string;
  limit?: number;
};

export type OrderSort = {
  sort?: string;
  order?: 'asc' | 'desc';
};

export type DateRange = {
  created?: string;
  updated?: string;
  closed?: string;
};

export type UserInvolvement = {
  author?: string;
  assignee?: string;
  mentions?: string;
  commenter?: string;
  involves?: string;
};

export interface GitHubCodeSearchParams extends Omit<BaseSearchParams, 'repo'> {
  exactQuery?: string;
  queryTerms?: string[];
  owner?: string | string[]; // Override to support array
  repo?: string | string[];
  language?: string;
  filename?: string;
  extension?: string;
  path?: string;
  match?: 'file' | 'path';
  size?: string;
  limit?: number;
  visibility?: 'public' | 'private' | 'internal';
  minify?: boolean; // Default true
  sanitize?: boolean; // Default true
  // Legacy fields for backward compatibility
  branch?: string;
  enableQueryOptimization?: boolean;
  symbol?: string;
  content?: string;
  is?: ('archived' | 'fork' | 'vendored' | 'generated')[];
  user?: string;
  org?: string;
}

export interface GitHubCommitSearchParams
  extends Omit<BaseSearchParams, 'query'>,
    OrderSort {
  exactQuery?: string;
  queryTerms?: string[];
  orTerms?: string[];
  query?: string; // Deprecated - use exactQuery or queryTerms instead
  author?: string;
  committer?: string;
  'author-date'?: string;
  'committer-date'?: string;
  'author-email'?: string;
  'author-name'?: string;
  'committer-email'?: string;
  'committer-name'?: string;
  merge?: boolean;
  hash?: string;
  parent?: string;
  tree?: string;
  visibility?: 'public' | 'private' | 'internal';
  sort?: 'author-date' | 'committer-date' | 'best-match';
  getChangesContent?: boolean; // Fetch actual code changes/diffs when analyzing changes (repo-specific searches only)
}

export interface GitHubPullRequestsSearchParams {
  // CORE SEARCH - Query is optional, you can search with filters only
  query?: string; // Search query for PR content (optional - you can search using filters only). Examples: "fix bug", "update dependencies", "security patch"

  // REPOSITORY FILTERS - Direct CLI flag mappings
  owner?: string | string[]; // Repository owner(s) - single owner or array for multi-owner search (--owner)
  repo?: string | string[]; // Repository name(s) - single repo or array for multi-repo search (--repo)
  language?: string; // Programming language filter (--language)
  archived?: boolean; // Filter by repository archived state (--archived)
  visibility?:
    | 'public'
    | 'private'
    | 'internal'
    | ('public' | 'private' | 'internal')[]; // Repository visibility - single value or array (--visibility)

  // USER INVOLVEMENT FILTERS - Direct CLI flag mappings
  author?: string; // GitHub username of PR author (--author)
  assignee?: string; // GitHub username of assignee (--assignee)
  mentions?: string; // PRs mentioning this user (--mentions)
  commenter?: string; // User who commented on PR (--commenter)
  involves?: string; // User involved in any way (--involves)
  'reviewed-by'?: string; // User who reviewed the PR (--reviewed-by)
  'review-requested'?: string; // User/team requested for review (--review-requested)

  // BASIC STATE FILTERS - Direct CLI flag mappings
  state?: 'open' | 'closed'; // Filter by state: open or closed (--state)
  draft?: boolean; // Filter by draft state (--draft)
  merged?: boolean; // Filter by merged state (--merged)
  locked?: boolean; // Filter by locked conversation status (--locked)

  // BRANCH FILTERS - Direct CLI flag mappings
  head?: string; // Filter on head branch name (--head)
  base?: string; // Filter on base branch name (--base)

  // DATE FILTERS - Direct CLI flag mappings with operator support
  created?: string; // Filter by created date, supports operators: ">2020-01-01", "2020-01-01..2023-12-31" (--created)
  updated?: string; // Filter by updated date, supports operators: ">2020-01-01", "2020-01-01..2023-12-31" (--updated)
  'merged-at'?: string; // Filter by merged date, supports operators: ">2020-01-01", "2020-01-01..2023-12-31" (--merged-at)
  closed?: string; // Filter by closed date, supports operators: ">2020-01-01", "2020-01-01..2023-12-31" (--closed)

  // ENGAGEMENT FILTERS - Direct CLI flag mappings with operator support
  comments?: number | string; // Filter by number of comments, supports operators: ">10", ">=5", "<5", "5..10" (--comments)
  reactions?: number | string; // Filter by number of reactions, supports operators: ">10", ">=5", "<50", "5..50" (--reactions)
  interactions?: number | string; // Total interactions (reactions + comments), supports operators: ">100", ">=50", "<20", "50..200" (--interactions)

  // REVIEW & CI FILTERS - Direct CLI flag mappings
  review?: 'none' | 'required' | 'approved' | 'changes_requested'; // Filter by review status (--review)
  checks?: 'pending' | 'success' | 'failure'; // Filter by checks status (--checks)

  // ORGANIZATION FILTERS - Direct CLI flag mappings
  app?: string; // Filter by GitHub App author (--app)
  'team-mentions'?: string; // Filter by team mentions (--team-mentions)
  label?: string | string[]; // Filter by label, supports multiple labels (--label)
  milestone?: string; // Milestone title (--milestone)
  project?: string; // Project board owner/number (--project)

  // BOOLEAN "MISSING" FILTERS - Direct CLI flag mappings
  'no-assignee'?: boolean; // Filter by missing assignee (--no-assignee)
  'no-label'?: boolean; // Filter by missing label (--no-label)
  'no-milestone'?: boolean; // Filter by missing milestone (--no-milestone)
  'no-project'?: boolean; // Filter by missing project (--no-project)

  // SEARCH SCOPE - Direct CLI flag mappings
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
}

export interface GitHubReposSearchParams
  extends Omit<BaseSearchParams, 'query'>,
    OrderSort {
  exactQuery?: string; // Exact phrase/word to search for
  queryTerms?: string[]; // Array of search terms (AND logic)

  // PRIMARY FILTERS (work alone)
  language?: string;
  forks?: string | number; // Support both string ranges and numbers
  stars?: string | number; // Support both string ranges and numbers
  topic?: string | string[]; // Support both single and array
  'number-topics'?: string | number; // Support both string ranges and numbers

  // SECONDARY FILTERS (require query or primary filter)
  archived?: boolean;
  created?: string;
  'include-forks'?: 'false' | 'true' | 'only';
  license?: string | string[]; // Support both single and array
  match?:
    | 'name'
    | 'description'
    | 'readme'
    | ('name' | 'description' | 'readme')[];
  updated?: string;
  visibility?: 'public' | 'private' | 'internal';
  'good-first-issues'?: string | number; // Support both string ranges and numbers
  'help-wanted-issues'?: string | number; // Support both string ranges and numbers
  followers?: string | number; // Support both string ranges and numbers
  size?: string; // Format: ">100", "<50", "10..100"

  // SORTING AND LIMITS
  limit?: number;
  sort?: 'forks' | 'help-wanted-issues' | 'stars' | 'updated' | 'best-match';
}

export interface GithubFetchRequestParams {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  contextLines?: number;
  minified: boolean;
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
}

export interface FileMetadata {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  extension?: string;
  category:
    | 'code'
    | 'config'
    | 'docs'
    | 'assets'
    | 'data'
    | 'build'
    | 'test'
    | 'other';
  language?: string;
  description?: string;
}

export interface GitHubRepositoryStructureParams {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  depth?: number;
  includeIgnored?: boolean; // If true, show all files/folders including normally ignored ones
  showMedia?: boolean; // If true, show media files (images, videos, audio). Default: false
}

export interface GitHubRepositoryContentsResult {
  path: string;
  baseUrl: string;
  files: Array<{
    name: string;
    size: number;
    url: string;
  }>;
  folders: string[];
  branchFallback?: {
    requested: string;
    used: string;
    message: string;
  };
}

export interface GitHubFileContentResponse {
  filePath: string;
  owner: string;
  repo: string;
  branch: string;
  content: string;
  // Actual content boundaries (with context applied)
  startLine?: number;
  endLine?: number;
  totalLines: number; // Always returned - total lines in the file
  isPartial?: boolean;
  // Original request parameters for LLM context
  requestedStartLine?: number;
  requestedEndLine?: number;
  requestedContextLines?: number;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?:
    | 'terser'
    | 'conservative'
    | 'aggressive'
    | 'json'
    | 'general'
    | 'markdown'
    | 'failed'
    | 'none';
  // Security metadata
  securityWarnings?: string[];
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

// GitHub API response types
export interface GitHubApiFileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

// Simplified repository contents result - token efficient
export interface SimplifiedRepositoryContents {
  repository: string;
  branch: string;
  path: string;
  githubBasePath: string;
  files: {
    count: number;
    files: Array<{
      name: string;
      size: number;
      url: string; // Relative path for fetching
    }>;
  };
  folders: {
    count: number;
    folders: Array<{
      name: string;
      url: string; // Relative path for browsing
    }>;
  };
}

// Optimized GitHub Search Code Types
export interface GitHubCodeSearchMatch {
  text: string;
  indices: [number, number];
}

export interface GitHubCodeTextMatch {
  fragment: string;
  matches: GitHubCodeSearchMatch[];
}

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
  textMatches: GitHubCodeTextMatch[];
  url: string;
}

// Optimized response structure for code search
export interface OptimizedCodeSearchResult {
  items: Array<{
    path: string;
    matches: Array<{
      context: string; // Simplified from fragment
      positions: Array<[number, number]>; // Just indices
    }>;
    url: string; // Relative path only
    repository: {
      nameWithOwner: string; // owner/repo format
      url: string; // GitHub repository URL
    };
  }>;
  total_count: number;
  repository?: {
    name: string; // owner/repo format
    url: string; // Shortened
  };
  // Security and processing metadata
  securityWarnings?: string[];
  minified?: boolean;
  minificationFailed?: boolean;
  minificationTypes?: string[];
}

// GitHub Search Commits Types
export interface GitHubCommitAuthor {
  name: string;
  email: string;
  date: string;
  login?: string;
}

export interface GitHubCommitRepository {
  name: string;
  fullName: string;
  url: string;
  description?: string;
}

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
    id: string;
    type: string;
    url: string;
  };
  committer?: {
    login: string;
    id: string;
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
  query: string;
  owner?: string;
  repo?: string;
  app?: string;
  archived?: boolean;
  author?: string;
  assignee?: string;
  mentions?: string;
  commenter?: string;
  comments?: string | number;
  involves?: string;
  'include-prs'?: boolean;
  interactions?: string | number;
  state?: 'open' | 'closed';
  label?: string | string[];
  milestone?: string;
  project?: string;
  language?: string;
  locked?: boolean;
  match?: 'title' | 'body' | 'comments';
  'no-assignee'?: boolean;
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  reactions?: string | number;
  'team-mentions'?: string;
  visibility?: 'public' | 'private' | 'internal';
  created?: string;
  updated?: string;
  closed?: string;
  limit?: number;
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
    | 'best-match';
  order?: 'asc' | 'desc';
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
}

// Basic issue data structure before fetching full details
export interface BasicGitHubIssue {
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
  repository: {
    name: string;
    nameWithOwner: string;
  };
  labels: Array<{
    name: string;
    color?: string;
    description?: string;
    id?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  url: string;
  commentsCount: number;
  reactions: number;
  // Legacy compatibility fields
  created_at: string;
  updated_at: string;
  _sanitization_warnings?: string[]; // Optional sanitization warnings
}

// Bulk GitHub Code Search Types
export interface GitHubCodeSearchQuery {
  id?: string; // Optional identifier for the query
  exactQuery?: string;
  queryTerms?: string[];
  owner?: string | string[];
  repo?: string | string[];
  language?: string;
  filename?: string;
  extension?: string;
  path?: string;
  match?: 'file' | 'path';
  size?: string;
  limit?: number;
  visibility?: 'public' | 'private' | 'internal';
  fallbackParams?: Partial<GitHubCodeSearchQuery>; // Fallback parameters if no results
}

export interface GitHubBulkCodeSearchParams {
  queries: GitHubCodeSearchQuery[]; // Up to 5 queries
}

export interface GitHubBulkCodeSearchResult {
  results: Array<{
    queryId?: string;
    originalQuery: GitHubCodeSearchQuery;
    result: OptimizedCodeSearchResult;
    fallbackTriggered: boolean;
    fallbackQuery?: GitHubCodeSearchQuery;
    error?: string;
  }>;
  totalQueries: number;
  successfulQueries: number;
  queriesWithFallback: number;
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

export interface EnhancedPackageSearchResult {
  npm?: Record<string, EnhancedPackageMetadata>;
  python?: Record<string, EnhancedPackageMetadata>;
  total_count: number;
  hints?: string[];
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
}

// Keep the old interface for backward compatibility (deprecated)
export interface PackageSearchWithMetadataParams {
  npmPackagesNames?: string | string[];
  npmPackageName?: string;
  pythonPackageName?: string;
  searchLimit?: number;
  npmSearchStrategy?: 'individual' | 'combined';
  // New parameter to control npm metadata fetching
  npmFetchMetadata?: boolean;
  // NPM View Package parameters - prefixed with npm
  npmField?: string;
  npmMatch?: string | string[];
}
