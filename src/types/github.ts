/**
 * TypeScript interfaces for GitHub API responses
 * Replaces 'any' types with proper type definitions
 */

// GitHub User/Owner interface
export interface GitHubOwner {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string | null;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: 'User' | 'Organization';
  site_admin: boolean;
}

// GitHub License interface
export interface GitHubLicense {
  key: string;
  name: string;
  spdx_id: string | null;
  url: string | null;
  node_id: string;
}

// GitHub Repository interface
export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubOwner;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  svn_url: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_downloads: boolean;
  archived: boolean;
  disabled: boolean;
  open_issues_count: number;
  license: GitHubLicense | null;
  allow_forking: boolean;
  is_template: boolean;
  web_commit_signoff_required?: boolean;
  topics: string[];
  visibility: 'public' | 'private' | 'internal';
  forks: number;
  open_issues: number;
  watchers: number;
  default_branch: string;
  score?: number; // Present in search results
}

// GitHub Commit interface
export interface GitHubCommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface GitHubCommitCommitter {
  name: string;
  email: string;
  date: string;
}

export interface GitHubCommitTree {
  sha: string;
  url: string;
}

export interface GitHubCommitParent {
  sha: string;
  url: string;
  html_url: string;
}

export interface GitHubCommitData {
  author: GitHubCommitAuthor;
  committer: GitHubCommitCommitter;
  message: string;
  tree: GitHubCommitTree;
  url: string;
  comment_count: number;
  verification?: {
    verified: boolean;
    reason: string;
    signature: string | null;
    payload: string | null;
  };
}

export interface GitHubCommit {
  sha: string;
  node_id: string;
  commit: GitHubCommitData;
  url: string;
  html_url: string;
  comments_url: string;
  author: GitHubOwner | null;
  committer: GitHubOwner | null;
  parents: GitHubCommitParent[];
  repository?: GitHubRepository;
  score?: number; // Present in search results
}

// GitHub Issue/Pull Request interfaces
export interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string | null;
}

export interface GitHubMilestone {
  url: string;
  html_url: string;
  labels_url: string;
  id: number;
  node_id: string;
  number: number;
  title: string;
  description: string | null;
  creator: GitHubOwner;
  open_issues: number;
  closed_issues: number;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  due_on: string | null;
  closed_at: string | null;
}

export interface GitHubIssue {
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  id: number;
  node_id: string;
  number: number;
  title: string;
  user: GitHubOwner;
  labels: GitHubLabel[];
  state: 'open' | 'closed';
  locked: boolean;
  assignee: GitHubOwner | null;
  assignees: GitHubOwner[];
  milestone: GitHubMilestone | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  active_lock_reason?: string | null;
  body: string | null;
  reactions?: {
    url: string;
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
  timeline_url?: string;
  performed_via_github_app?: unknown;
  state_reason?: string | null;
  repository?: GitHubRepository;
  score?: number; // Present in search results
}

// GitHub Pull Request interface (extends Issue)
export interface GitHubPullRequestHead {
  label: string;
  ref: string;
  sha: string;
  user: GitHubOwner;
  repo: GitHubRepository | null;
}

export interface GitHubPullRequest extends Omit<GitHubIssue, 'repository'> {
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    merged_at: string | null;
  };
  draft?: boolean;
  head: GitHubPullRequestHead;
  base: GitHubPullRequestHead;
  _links: {
    self: { href: string };
    html: { href: string };
    issue: { href: string };
    comments: { href: string };
    review_comments: { href: string };
    review_comment: { href: string };
    commits: { href: string };
    statuses: { href: string };
  };
  merged: boolean;
  mergeable: boolean | null;
  rebaseable?: boolean | null;
  mergeable_state: string;
  merged_by: GitHubOwner | null;
  comments_count?: number;
  review_comments?: number;
  maintainer_can_modify?: boolean;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  repository?: GitHubRepository;
}

// Search result interfaces
export interface GitHubSearchResult<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

// Smart suggestion interfaces
export interface SmartSuggestions {
  hints: string[];
  searchType: 'no_results' | 'api_error' | 'validation_error' | 'success';
  suggestions: {
    broaderSearch?: string[];
    semanticAlternatives?: string[];
    splitQueries?: Array<Record<string, unknown>>;
    alternativeApproaches?: string[];
    recoveryActions?: string[];
  };
}

// File content interfaces
export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string; // Base64 encoded
  encoding?: 'base64';
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

// Code search interfaces
export interface GitHubTextMatch {
  object_url: string;
  object_type: string;
  property: string;
  fragment: string;
  matches: Array<{
    text: string;
    indices: [number, number];
  }>;
}

export interface GitHubCodeSearchItem {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: GitHubRepository;
  score: number;
  file_size?: number;
  language?: string | null;
  last_modified_at?: string;
  textMatches?: GitHubTextMatch[];
}

// API response metadata
export interface APIResponseMetadata {
  queryArgs?: Record<string, unknown>;
  error?: string;
  searchType?: string;
  suggestions?: SmartSuggestions;
  researchGoal?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}
