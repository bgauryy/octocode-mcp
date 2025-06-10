export type BaseSearchParams = {
  query?: string;
  owner?: string;
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
  repo?: string[];
  language?: string;
  filename?: string;
  extension?: string;
  path?: string;
  match?: 'file' | 'path';
  branch?: string;
  size?: string;
  limit?: number;
}

export interface GitHubCommitsSearchParams extends BaseSearchParams, OrderSort {
  query: string;
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

export interface GitHubReposSearchParams extends BaseSearchParams, OrderSort {
  archived?: boolean;
  created?: string;
  followers?: number;
  forks?: number;
  goodFirstIssues?: number;
  helpWantedIssues?: number;
  includeForks?: 'false' | 'true' | 'only';
  language?: string;
  license?: string[];
  limit?: number;
  match?: 'name' | 'description' | 'readme';
  numberTopics?: number;
  size?: string;
  sort?: 'forks' | 'help-wanted-issues' | 'stars' | 'updated' | 'best-match';
  stars?: string;
  topic?: string[];
  updated?: string;
  visibility?: 'public' | 'private' | 'internal';
}

export interface GitHubRepositoryViewParams {
  owner?: string;
  repo: string;
}

export interface GithubFetchRequestParams {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}

export interface GitHubSearchResult {
  searchType:
    | 'code'
    | 'commits'
    | 'issues'
    | 'prs'
    | 'discussions'
    | 'topics'
    | 'users';
  query: string;
  actualQuery?: string; // The actual constructed query sent to GitHub CLI
  totalCount?: number;
  results: string | any[];
  rawOutput: string;
  analysis?: {
    summary: string;
    repositories?: string[];
    languages?: string[];
    fileTypes?: string[];
    topMatches?: Array<{
      repository: string;
      path: string;
      url: string;
      score: number;
      matchCount: number;
      language: string;
      stars: number;
    }>;
  };
}

export interface GitHubReposSearchResult {
  searchType: 'repos';
  query: string;
  totalCount?: number;
  results: string;
  rawOutput: string;
  metadata?: {
    totalRepositories: number;
    languages: string[];
    averageStars: number;
    recentlyUpdated: number;
    topRepositories: Array<{
      name: string;
      stars: number;
      description: string;
      language: string;
      url: string;
      forks: number;
      isPrivate: boolean;
      updatedAt: string;
    }>;
    searchParams: {
      query?: string;
      owner?: string;
      language?: string;
      stars?: string;
      updated?: string;
    };
  };
}

export interface GitHubRepositoryViewResult {
  owner: string;
  repo: string;
  repositoryInfo: string;
  rawOutput: string;
}

export interface NpmRepositoryResult {
  'repository.url': string;
  'repository.directory': string;
  packageName: string;
  description: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export interface NpmSearchParams {
  query: string;
  json?: boolean;
  searchlimit?: number;
}

export interface ColumbusSearchResult {
  entries: ColumbusEntry[];
  limitExceed: number;
  duration: number;
}

export interface ColumbusEntry {
  repo: {
    id: {
      org: string;
      name: string;
    };
    gh: {
      githubUrl: string;
      defaultBranch: string;
    };
  };
  path: string;
  lines: Array<{
    line: string;
    lineNumber: number;
  }>;
}

export interface CodeSearchEntry {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  githubUrl: string;
  path: string;
  code: string;
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

export interface NpmPackageInfo {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  repository?: {
    type: string;
    url: string;
    directory?: string;
  };
  bugs?: {
    url: string;
  };
  license?: string;
  keywords?: string[];
  author?:
    | string
    | {
        name: string;
        email?: string;
        url?: string;
      };
  maintainers?: Array<{
    name: string;
    email?: string;
  }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface GitHubRepositoryStructureParams {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
}

export interface GitHubRepositoryStructureResult {
  owner: string;
  repo: string;
  branch: string;
  structure: string[];
  rawOutput?: any;
  branchFallback?: {
    requested: string;
    used: string;
    message: string;
  };
}

export interface GitHubDiscussionsSearchParams
  extends BaseSearchParams,
    UserInvolvement,
    DateRange,
    OrderSort {
  category?: string;
  answered?: boolean;
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

export interface GitHubTopicsSearchParams extends OrderSort {
  query: string;
  owner?: string;
  featured?: boolean;
  curated?: boolean;
  repositories?: string;
  created?: string;
  sort?: 'featured' | 'repositories' | 'created' | 'updated';
  limit?: number;
}

export interface GitHubUsersSearchParams extends BaseSearchParams, OrderSort {
  type?: 'user' | 'org';
  location?: string;
  language?: string;
  followers?: string;
  repos?: string;
  created?: string;
  sort?: 'followers' | 'repositories' | 'joined';
  order?: 'asc' | 'desc';
  limit?: number;
  page?: number;
}
