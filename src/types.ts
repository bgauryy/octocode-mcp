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
  extends Omit<BaseSearchParams, 'repo'>,
    UserInvolvement,
    DateRange,
    OrderSort {
  repo?: string | string[]; // Allow multiple repos
  state?: 'open' | 'closed';
  head?: string;
  base?: string;
  language?: string;
  merged?: boolean; // Changed from string | boolean, for --merged flag
  mergedAt?: string; // For merged_at:YYYY-MM-DD filter
  draft?: boolean;
  reviewedBy?: string;
  reviewRequested?: string;
  checks?: 'pending' | 'success' | 'failure';
  review?: 'none' | 'required' | 'approved' | 'changes_requested';
  // New fields based on gh search prs --help
  app?: string;
  archived?: boolean;
  comments?: string; // Numeric filter, e.g., ">10"
  interactions?: string; // Numeric filter
  label?: string | string[]; // Can be one or more
  locked?: boolean;
  match?: ('title' | 'body' | 'comments') | ('title' | 'body' | 'comments')[];
  milestone?: string;
  noAssignee?: boolean;
  noLabel?: boolean;
  noMilestone?: boolean;
  noProject?: boolean;
  project?: string; // Format: owner/number
  reactions?: string; // Numeric filter
  teamMentions?: string;
  visibility?:
    | ('public' | 'private' | 'internal')
    | ('public' | 'private' | 'internal')[];
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
    | 'updated'; // Removed 'best-match' as default is best-match and CLI errors if explicitly set for PRs sometimes
}

export interface GitHubReposSearchParams
  extends Omit<BaseSearchParams, 'query'>,
    OrderSort {
  query?: string; // Make query optional

  // PRIMARY FILTERS (work alone)
  language?: string;
  forks?: string;
  stars?: string;
  topic?: string[];
  numberOfTopics?: string;

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
  followers?: string;
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
  latest: string; // From dist-tags
  license: string | { type: string; url?: string } | null; // Updated
  timeCreated: string; // ISO date string
  timeModified: string; // ISO date string
  repository?:
    | { type?: string; url?: string; directory?: string }
    | string
    | null; // Updated, was repositoryGitUrl
  registryUrl?: string; // Derived from tarball URL
  description?: string | null;
  size?: number | null; // unpackedSize from dist
  dependencies?: Record<string, string> | null;
  devDependencies?: Record<string, string> | null;
  peerDependencies?: Record<string, string> | null; // New
  exports?: string | Record<string, unknown> | null; // Made nullable
  versions?: Array<{ version: string; releaseDate: string }> | null; // Recent versions, made nullable
  versionStats?: {
    // Made nullable
    total: number;
    official: number;
  } | null;
  homepage?: string | null; // New
  keywords?: string[] | null; // New
  maintainers?: Array<
    string | { name: string; email?: string; url?: string }
  > | null; // New
  bugs?: { url?: string; email?: string } | string | null; // New
  main?: string | null; // New
  engines?: Record<string, string> | null; // New
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
  comments?: string;
  involves?: string;
  includePrs?: boolean;
  interactions?: string;
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
  reactions?: string;
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
  created: string; // Date only format
  url: string;
  comments: number;
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
  repository_full_name: string; // "owner/repo"
  listed_path_from_repo_root: string; // The full path of the directory whose contents are listed, e.g., "src" or "" for root
  branch_used: string;
  items: GitHubRepositoryEntry[];
  branch_fallback?: {
    requested_branch: string;
    used_branch: string;
    message: string;
  };
}

export type GitHubFileContentParams = {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
};

/* The NpmPackage interface is deprecated and replaced by NpmSearchedPackageItem for search
   and NpmViewPackageResult for viewing package details.
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
*/

// Updated types for github_get_contents (viewRepositoryStructure)
export interface GitHubRepositoryFileEntry {
  name: string; // Filename, e.g., "file.txt"
  type: 'file';
  size: number;
  path_from_repo_root: string; // Full path from repository root, e.g., "src/file.txt"
  html_url: string; // URL to view the file in the browser
  download_url?: string | null; // URL to download the file, if available
}

export interface GitHubRepositoryFolderEntry {
  name: string; // Folder name, e.g., "subfolder" (without trailing slash)
  type: 'dir';
  path_from_repo_root: string; // Full path from repository root, e.g., "src/subfolder"
  html_url: string; // URL to view the folder in the browser
}

export type GitHubRepositoryEntry =
  | GitHubRepositoryFileEntry
  | GitHubRepositoryFolderEntry;

// Types for github_get_file_content (fetchGitHubFileContent)
export interface GitHubFileContentResult {
  repository_full_name: string; // e.g., "owner/repo"
  file_path_from_repo_root: string;
  branch_used: string;
  size_bytes: number;
  content_type: 'text' | 'binary';
  content: string; // Decoded UTF-8 string if text, original base64 string if binary
  encoding_source: 'utf-8' | 'base64'; // Indicates if content is decoded utf-8 or original base64 from API
  html_url: string; // URL to view the file in the browser
  download_url: string | null; // URL to download the raw file
  branch_fallback_info?: {
    requested_branch: string;
    used_branch: string;
    message: string;
  };
}
// End of types for github_get_file_content

// Types for github_search_commits
interface GhCommitAuthorInfo {
  name?: string;
  email?: string;
  date?: string; // ISO 8601 date string
}

interface GhCommitUserInfo {
  login?: string; // GitHub username
  id?: number;
  node_id?: string;
  avatar_url?: string;
  html_url?: string; // URL to GitHub user profile
  type?: 'User' | 'Bot';
}

interface GhCommitDetails {
  author?: GhCommitAuthorInfo;
  committer?: GhCommitAuthorInfo;
  message?: string;
  tree?: { sha?: string; url?: string };
  comment_count?: number;
  url?: string; // API URL for the commit details
}

interface GhCommitParent {
  sha?: string;
  url?: string; // API URL
  html_url?: string; // Browser URL
}

// Represents a single item from the `gh search commits --json` output
export interface GhSearchedCommitItem {
  sha: string;
  id?: string; // node_id
  commit?: GhCommitDetails;
  author?: GhCommitUserInfo; // GitHub user who authored the commit
  committer?: GhCommitUserInfo; // GitHub user who committed
  url: string; // HTML URL to the commit page
  parents?: GhCommitParent[];
  repository?: {
    id?: number;
    node_id?: string;
    name?: string;
    full_name?: string; // "owner/repo"
    private?: boolean;
    owner?: GhCommitUserInfo;
    html_url?: string; // URL to repository
  };
}

export interface ProcessedCommitItem {
  sha: string;
  message_first_line: string;
  author_name?: string;
  author_email?: string;
  authored_date?: string; // YYYY-MM-DD
  committer_name?: string;
  committer_email?: string;
  committed_date?: string; // YYYY-MM-DD
  repository_full_name?: string;
  html_url: string;
  parent_shas?: string[];
}

export interface GitHubCommitsSearchResult {
  query_used?: string; // The actual query string sent to gh CLI
  total_returned: number;
  commits: ProcessedCommitItem[];
  summary?: {
    top_authors?: Array<{ name: string; commit_count: number }>;
    repositories_searched?: string[];
    // Potentially add date range if it was part of the input query params
  };
}
// End of types for github_search_commits

// Types for github_search_issues
export interface GhUserStub {
  login: string;
  url?: string; // HTML URL to profile
  type?: 'User' | 'Bot';
}

export interface GhLabelStub {
  name: string;
  color?: string;
  description?: string;
}

export interface GhRepositoryStub {
  fullName: string; // "owner/repo"
  url?: string; // HTML URL to repo
}

// Raw item from `gh search issues --json`
export interface GhCliIssueItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author?: GhUserStub;
  repository?: GhRepositoryStub; // This might be nested differently by gh CLI, need to check its direct JSON output for `repository` field structure
  labels?: GhLabelStub[];
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  closedAt?: string | null; // ISO 8601
  url: string; // HTML URL to the issue
  commentsCount?: number;
  isPullRequest?: boolean;
  isLocked?: boolean;
  assignees?: GhUserStub[];
  body?: string; // Full body, might be long
  // authorAssociation?: string;
  id?: string; // GraphQL node ID
}

// Processed item for the LLM
export interface ProcessedIssueItem {
  issue_number: number;
  title: string;
  state: 'open' | 'closed';
  author_login?: string;
  repository_full_name?: string;
  labels_names?: string[];
  created_date?: string; // YYYY-MM-DD
  updated_date?: string; // YYYY-MM-DD
  closed_date?: string | null; // YYYY-MM-DD
  html_url: string;
  comments_count?: number;
  is_pull_request: boolean;
  is_locked: boolean;
  assignees_logins?: string[];
  body_snippet?: string; // Short snippet of the body
}

// New result structure for github_search_issues tool
export interface GitHubIssuesQueryResult {
  query_used: string;
  total_returned: number; // Number of items returned by the CLI (respecting its limit)
  issues: ProcessedIssueItem[];
  // No server-side total_count or incomplete_results from gh search issues CLI directly
}
// End of types for github_search_issues

// Types for Npm Package Search
export interface NpmPackageLinkInfo {
  npm?: string | null;
  homepage?: string | null;
  repository?: string | null;
  bugs?: string | null;
}

export interface NpmPackageUserInfo {
  username: string;
  email?: string | null;
}

export interface NpmSearchedPackageItem {
  name: string;
  version: string;
  description?: string | null;
  keywords?: string[] | null;
  date?: string | null; // Publish date as ISO string
  links?: NpmPackageLinkInfo | null;
  publisher?: NpmPackageUserInfo | null;
  maintainers?: NpmPackageUserInfo[] | null;
  license?: string | null; // Added based on npm search output
  // score and searchScore are sometimes present but highly variable, omitting for now
}

export interface NpmPackageSearchResultData {
  search_terms: string[]; // The terms used for the search
  total_found_for_terms: number; // Total packages returned for these terms (respecting searchLimit per term)
  packages: NpmSearchedPackageItem[];
}
// End Types for Npm Package Search

// Updated types for github_get_contents (viewRepositoryStructure)
// export interface GitHubRepositoryFileEntry {
// name: string; // Filename, e.g., "file.txt"
// type: 'file';
// size: number;
// path_from_repo_root: string; // Full path from repository root, e.g., "src/file.txt"
// html_url: string; // URL to view the file in the browser
// download_url?: string | null; // URL to download the file, if available
// }

// Types for GitHub Pull Request Search (using gh search prs)
// Reuses GhUserStub, GhLabelStub, GhRepositoryStub from github_search_issues types

export interface GhRawPullRequestItem {
  id: string; // GraphQL Node ID
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string; // HTML URL
  isDraft: boolean;
  isLocked: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  closedAt?: string | null; // ISO 8601
  body?: string | null;
  commentsCount?: number;
  author?: GhUserStub | null; // Can be null if GH App etc.
  repository?: GhRepositoryStub | null;
  labels?: GhLabelStub[] | null;
  assignees?: GhUserStub[] | null;
  authorAssociation?: string | null;
  // Fields like headRefName, baseRefName are not standard in `gh search prs --json` default output
  // To get them, specific jq processing or additional API calls would be needed.
}

export interface ProcessedPullRequestItem {
  pr_number: number;
  title: string;
  state: 'open' | 'closed';
  author_login?: string | null;
  repository_full_name?: string | null;
  labels_names?: string[] | null;
  created_date?: string | null; // YYYY-MM-DD
  updated_date?: string | null; // YYYY-MM-DD
  closed_date?: string | null; // YYYY-MM-DD
  html_url: string;
  is_draft: boolean;
  is_locked: boolean;
  comments_count?: number;
  assignees_logins?: string[] | null;
  body_snippet?: string | null; // Short snippet of the body
}

export interface GitHubPullRequestsQueryResult {
  query_used: string;
  total_returned: number; // Number of items returned by the CLI (respecting its limit)
  pull_requests: ProcessedPullRequestItem[];
}
// End of Types for GitHub Pull Request Search
