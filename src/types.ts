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
  match?: 'file' | 'path' | ('file' | 'path')[]; // Support array
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

export interface GitHubCommitsSearchParams
  extends Omit<BaseSearchParams, 'query'>,
    OrderSort {
  query?: string; // Make query optional
  author?: string;
  committer?: string;
  authorDate?: string;
  committerDate?: string;
  authorEmail?: string;
  authorName?: string;
  committerEmail?: string;
  committerName?: string;
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
  merged?: string;
  mergedAt?: string;
  draft?: boolean;
  reviewedBy?: string;
  reviewRequested?: string;
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
  forks?: number;
  stars?: string;
  topic?: string[];

  // SECONDARY FILTERS (require query or primary filter)
  archived?: boolean;
  created?: string;
  includeForks?: 'false' | 'true' | 'only';
  license?: string[];
  match?: 'name' | 'description' | 'readme';
  updated?: string;
  visibility?: 'public' | 'private' | 'internal';
  goodFirstIssues?: string; // Format: ">=10", ">5", etc.
  helpWantedIssues?: string; // Format: ">=5", ">10", etc.
  followers?: number;
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
}

export type NpmViewPackageParams = {
  packageName: string;
};

export interface NpmViewPackageResult {
  name: string;
  latest: string;
  license: string;
  timeCreated: string;
  timeModified: string;
  repositoryGitUrl: string;
  registryUrl: string;
  description: string;
  size: number;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  exports: string | Record<string, unknown>;
  versions: Array<{ version: string; releaseDate: string }>;
  versionStats: {
    total: number;
    official: number;
  };
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
  comments?: number;
  involves?: string;
  includePrs?: boolean;
  interactions?: number;
  state?: 'open' | 'closed';
  label?: string;
  labels?: string;
  milestone?: string;
  project?: string;
  language?: string;
  locked?: boolean;
  match?: 'title' | 'body' | 'comments';
  noAssignee?: boolean;
  noLabel?: boolean;
  noMilestone?: boolean;
  noProject?: boolean;
  reactions?: number;
  teamMentions?: string;
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
  searchType: 'issues';
  query: string;
  results: GitHubIssueItem[];
  metadata: {
    total_count: number;
    incomplete_results: boolean;
  };
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
  searchType: 'prs';
  query: string;
  results: GitHubPullRequestItem[];
  metadata: {
    total_count: number;
    incomplete_results: boolean;
  };
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
};

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
