export interface GitHubIssueSearchResult {
  total_count: number;
  incomplete_results: boolean;
  issues: Array<{
    id: number;
    number: number;
    title: string;
    url: string;
    html_url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    state: 'open' | 'closed';
    state_reason?: string | null;
    created_at: string;
    updated_at: string;
    closed_at?: string | null;
    body?: string | null;
    user: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      type: string;
    };
    assignee?: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      type: string;
    } | null;
    assignees?: Array<{
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      type: string;
    }>;
    labels: Array<{
      id: number;
      name: string;
      color: string;
      description?: string | null;
      default: boolean;
    }>;
    milestone?: {
      id: number;
      number: number;
      title: string;
      description?: string | null;
      state: 'open' | 'closed';
      created_at: string;
      updated_at: string;
      due_on?: string | null;
      closed_at?: string | null;
    } | null;
    locked: boolean;
    active_lock_reason?: string | null;
    comments: number;
    reactions: {
      '+1': number;
      '-1': number;
      laugh: number;
      hooray: number;
      confused: number;
      heart: number;
      rocket: number;
      eyes: number;
      total_count: number;
      url: string;
    };
    repository?: {
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
        id: number;
        type: string;
      };
      private: boolean;
      html_url: string;
      description?: string | null;
      fork: boolean;
      language?: string | null;
      stargazers_count: number;
      watchers_count: number;
      forks_count: number;
      open_issues_count: number;
      default_branch: string;
    };
    score: number;
    // Pull request specific fields (when issue is a PR)
    pull_request?: {
      url: string;
      html_url: string;
      diff_url: string;
      patch_url: string;
      merged_at?: string | null;
    };
  }>;
}

export interface GitHubIssueSearchError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
