export interface GitHubCommitSearchResult {
  total_count: number;
  incomplete_results: boolean;
  commits: Array<{
    sha: string;
    node_id: string;
    url: string;
    html_url: string;
    commit: {
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
      tree: {
        sha: string;
        url: string;
      };
      verification?: {
        verified: boolean;
        reason: string;
        signature?: string;
        payload?: string;
      };
    };
    author?: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    };
    committer?: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    };
    parents: Array<{
      sha: string;
      url: string;
      html_url: string;
    }>;
    repository?: {
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
        id: number;
      };
      private: boolean;
      html_url: string;
      description?: string;
    };
    score: number;
    // Optional fields for when getChangesContent=true
    files?: Array<{
      sha?: string;
      filename: string;
      status:
        | 'added'
        | 'removed'
        | 'modified'
        | 'renamed'
        | 'copied'
        | 'changed'
        | 'unchanged';
      additions: number;
      deletions: number;
      changes: number;
      blob_url?: string;
      raw_url?: string;
      contents_url?: string;
      patch?: string;
      previous_filename?: string;
    }>;
    stats?: {
      total: number;
      additions: number;
      deletions: number;
    };
  }>;
}

export interface GitHubCommitSearchError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
