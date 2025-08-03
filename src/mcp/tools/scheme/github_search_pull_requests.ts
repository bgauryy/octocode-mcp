export interface GitHubPullRequestSearchResult {
  total_count: number;
  incomplete_results: boolean;
  pull_requests: Array<{
    id: number;
    number: number;
    title: string;
    url: string;
    html_url: string;
    state: 'open' | 'closed';
    draft: boolean;
    merged: boolean;
    created_at: string;
    updated_at: string;
    closed_at?: string;
    merged_at?: string;
    user: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    };
    assignees?: Array<{
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    }>;
    labels?: Array<{
      id: number;
      name: string;
      color: string;
      description?: string;
    }>;
    milestone?: {
      id: number;
      title: string;
      description?: string;
      state: 'open' | 'closed';
      created_at: string;
      updated_at: string;
      due_on?: string;
    };
    head: {
      ref: string;
      sha: string;
      repo?: {
        id: number;
        name: string;
        full_name: string;
        owner: {
          login: string;
          id: number;
        };
        private: boolean;
        html_url: string;
        default_branch: string;
      };
    };
    base: {
      ref: string;
      sha: string;
      repo: {
        id: number;
        name: string;
        full_name: string;
        owner: {
          login: string;
          id: number;
        };
        private: boolean;
        html_url: string;
        default_branch: string;
      };
    };
    body?: string;
    comments?: number;
    review_comments?: number;
    commits?: number;
    additions?: number;
    deletions?: number;
    changed_files?: number;
  }>;
}

export interface GitHubPullRequestSearchError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
