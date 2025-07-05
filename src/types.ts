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
  query: string;
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
  query?: string; // Make query optional
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
}

export interface GitHubPullRequestsSearchParams
  extends BaseSearchParams,
    UserInvolvement,
    DateRange,
    OrderSort {
  state?: 'open' | 'closed';
  head?: string;
  base?: string;
  language?: string;
  merged?: string | boolean;
  'merged-at'?: string;
  draft?: boolean;
  'reviewed-by'?: string;
  'review-requested'?: string;
  app?: string;
  archived?: boolean;
  comments?: string | number;
  interactions?: string | number;
  'team-mentions'?: string;
  reactions?: string | number;
  locked?: boolean;
  'no-assignee'?: boolean;
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  label?: string | string[];
  milestone?: string;
  project?: string;
  visibility?: 'public' | 'private' | 'internal';
  match?: 'title' | 'body' | 'comments';
  checks?: 'pending' | 'success' | 'failure';
  review?: 'none' | 'required' | 'approved' | 'changes_requested';
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
    | 'updated';
}

export interface GitHubReposSearchParams
  extends Omit<BaseSearchParams, 'query'>,
    OrderSort {
  query?: string; // Make query optional

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
  minified?: boolean;
}

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
  author: string;
  repository: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  url: string;
  comments: number;
  reactions: number;
}

export interface GitHubIssuesSearchResult {
  results: GitHubIssueItem[];
}

export interface GitHubPullRequestItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  repository: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  merged_at?: string;
  closed_at?: string;
  url: string;
  comments: number;
  reactions: number;
  draft: boolean;
  head?: string;
  base?: string;
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

export type GitHubFileContentParams = {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  minified?: boolean;
};

export interface GitHubFileContentResponse {
  filePath: string;
  owner: string;
  repo: string;
  branch: string;
  content: string;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?: 'javascript' | 'generic' | 'failed' | 'none';
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
