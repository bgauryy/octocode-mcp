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
  repo?: string[];
  language?: string;
  filename?: string;
  extension?: string;
  path?: string;
  match?: 'file' | 'path' | ('file' | 'path')[]; // Support array
  size?: string;
  visibility?: 'public' | 'private' | 'internal';
  limit?: number;
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
  query: string;
  actualQuery?: string;
  totalCount?: number;
  results: string | any[];
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
  organizationalFallback?: {
    suggestion: string;
    fallbackSteps: string[];
  };
}

export interface GitHubReposSearchResult {
  query: string;
  totalCount?: number;
  results: string;
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
}

export interface NpmDistTags {
  latest: string;
}

export interface NpmTime {
  created: string;
  modified: string;
  [version: string]: string;
}

export interface NpmBugs {
  url: string;
}

export interface NpmRepository {
  type: string;
  url: string;
}

export interface NpmMaintainer {
  email?: string;
  name: string;
}

export interface NpmUsers {
  [username: string]: boolean;
}

export interface NpmEngines {
  node: string;
}

export interface NpmTypesVersions {
  [key: string]: {
    [key: string]: string[];
  };
}

export interface NpmScripts {
  [scriptName: string]: string;
}

export interface NpmDependencies {
  [packageName: string]: string;
}

export interface NpmDevDependencies {
  [packageName: string]: string;
}

export interface NpmResolutions {
  [packageName: string]: string;
}

export interface NpmAttestations {
  url: string;
  provenance: {
    predicateType: string;
  };
}

export interface NpmSignatures {
  keyid: string;
  sig: string;
}

export interface NpmDist {
  integrity: string;
  shasum: string;
  tarball: string;
  fileCount: number;
  unpackedSize: number;
  attestations: NpmAttestations;
  signatures: NpmSignatures[];
}

export interface NpmOperationalInternal {
  host: string;
  tmp: string;
}

export interface NpmData {
  _id: string;
  _rev: string;
  name: string;
  'dist-tags': NpmDistTags;
  versions: string[];
  time: NpmTime;
  bugs: NpmBugs;
  author: string;
  license: string;
  homepage: string;
  keywords: string[];
  repository: NpmRepository;
  description: string;
  maintainers: string[];
  readmeFilename: string;
  users: NpmUsers;
  _contentLength: number;
  version: string;
  type?: string;
  engines: NpmEngines;
  exports: string | Record<string, unknown>;
  typesVersions: NpmTypesVersions;
  scripts: NpmScripts;
  dependencies: NpmDependencies;
  devDependencies: NpmDevDependencies;
  resolutions: NpmResolutions;
  gitHead: string;
  _nodeVersion: string;
  _npmVersion: string;
  dist: NpmDist;
  directories: Record<string, never>;
  _npmOperationalInternal: NpmOperationalInternal;
  _hasShrinkwrap: boolean;
}

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

export interface NpmViewResult {
  npmData: Partial<NpmData>;
  popularityInfo: string;
  lastAnalyzed: string;
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

export interface GitHubRepositoryStructureResult {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  items?: FileMetadata[];
  analysis?: {
    totalItems: number;
    directories: number;
    files: number;
    categories: Array<{ category: string; count: number }>;
    languages: Array<{ language: string; count: number }>;
    totalSize: number;
    largestFiles: Array<{ name: string; size?: number; category: string }>;
  };
  structure: string[];
  branchFallback?: {
    requested: string;
    used: string;
    message: string;
  };
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

// ===== VERIFIED RETURN TYPES FOR ALL TOOLS =====

export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export interface SearchResultSummary {
  query: string;
  totalResults: number;
  resultType:
    | 'repositories'
    | 'code'
    | 'commits'
    | 'issues'
    | 'pull_requests'
    | 'users'
    | 'topics'
    | 'packages';
  timestamp: string;
  suggestions?: string[];
  owner?: string;
  limit: number;
}

export interface OptimizedSearchResponse extends ToolResponse {
  metadata?: {
    summary: SearchResultSummary;
    queryOptimization?: {
      original: string;
      modified: string;
      reason: string;
    };
    orgDetection?: {
      detected: boolean;
      orgName?: string;
      autoApplied: boolean;
    };
  };
}

export interface NPMPackageResult {
  name: string;
  version: string;
  description: string | null;
  date: string | null;
  keywords: string[];
  links: {
    homepage: string | null;
    repository: string | null;
    bugs: string | null;
    npm: string;
  };
}

export interface GitHubSearchAnalysis {
  summary: string;
  repositories: string[];
  languages: string[];
  fileTypes: string[];
  topMatches: string[];
  suggestions?: string[];
}

export interface RepositorySearchResult {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
  created_at: string;
}

export interface CodeSearchResult {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
  };
  score: number;
}

// Quality thresholds for filtering results
export const QUALITY_THRESHOLDS = {
  MIN_STARS: 10,
  MIN_FORKS: 2,
  MAX_RESULTS_LLM_OPTIMAL: 30,
  MAX_RESULTS_ABSOLUTE: 50,
  PAGINATION_SIZE: 20,
} as const;
