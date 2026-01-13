# githubSearchPullRequests

Search and analyze pull request history on GitHub.

## Import

```typescript
import { githubSearchPullRequests } from 'octocode-research';
```

## ⚠️ Requirements

- **GitHub token required**: Set `GITHUB_TOKEN` env var or use `gh auth login`
- **Initialize first**: Call `initialize()` before using

## Use Case

**Code archaeology**: Understand WHY code was written the way it is.

## Input Type

```typescript
interface GitHubPullRequestSearchQuery {
  // Research context (required)
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  
  // Search by PR number (ignores ALL other filters!)
  prNumber?: number;
  
  // OR search by filters
  owner?: string;
  repo?: string;
  query?: string;               // Search terms
  state?: 'open' | 'closed';
  merged?: boolean;
  author?: string;
  assignee?: string;
  label?: string | string[];
  
  // Date filters
  created?: string;             // Date range
  closed?: string;
  merged_at?: string;
  updated?: string;
  
  // Content options
  type?: 'metadata' | 'partialContent' | 'fullContent';
  withComments?: boolean;       // Include review comments
  withCommits?: boolean;        // Include commit list
  
  // For partialContent type:
  partialContentMetadata?: Array<{
    file: string;               // File path to get diff
    additions?: number[];       // Specific added lines
    deletions?: number[];       // Specific deleted lines
  }>;
  
  // Matching
  match?: ('title' | 'body' | 'comments')[];
  
  // Advanced filters
  draft?: boolean;
  comments?: number | string;   // ">=5", "10..20"
  interactions?: number | string;
  reactions?: number | string;
  
  // Pagination
  limit?: number;               // Default: 5, max: 10
  page?: number;                // Default: 1, max: 10
  order?: 'asc' | 'desc';
  sort?: 'created' | 'updated' | 'best-match';
}
```

## Output Type

```typescript
interface PullRequestSearchResult {
  status?: 'hasResults' | 'empty' | 'error';
  pullRequests?: Array<{
    number: number;
    title: string;
    state: 'open' | 'closed';
    merged?: boolean;
    author?: string;
    body?: string;
    changedFiles?: number;
    additions?: number;
    deletions?: number;
    url: string;
    createdAt?: string;
    closedAt?: string;
    mergedAt?: string;
    labels?: string[];
    comments?: Array<{
      author: string;
      body: string;
      createdAt: string;
    }>;
    commits?: Array<{
      sha: string;
      message: string;
      author: string;
    }>;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
  }>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
  };
  hints?: string[];
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
}
```

## Content Types

| Type | Use Case | Data Included |
|------|----------|---------------|
| `metadata` | Quick overview | Title, author, state, stats |
| `partialContent` | Specific file changes | Diffs for selected files |
| `fullContent` | Complete PR | All diffs, comments, commits |

## Examples

### Search merged PRs

```typescript
import { githubSearchPullRequests, initialize } from 'octocode-research';

await initialize();

const result = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Understand code history',
    researchGoal: 'Find PRs that modified auth',
    reasoning: 'Understanding why code was written',
    owner: 'expressjs',
    repo: 'express',
    state: 'closed',
    merged: true,
    query: 'authentication',
    type: 'metadata',
  }]
});
```

### Get specific PR details

```typescript
const result = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Review specific PR',
    researchGoal: 'Get PR #123 details',
    reasoning: 'Understanding the change',
    prNumber: 123,  // Ignores other filters!
    type: 'metadata',
    withComments: true,
  }]
});
```

### Get file changes from PR

```typescript
const result = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Review file changes',
    researchGoal: 'Get diff for specific file',
    reasoning: 'Understanding what changed',
    prNumber: 456,
    type: 'partialContent',
    partialContentMetadata: [{
      file: 'src/auth.ts',
    }],
  }]
});
```

### Search by author

```typescript
const result = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Find author contributions',
    researchGoal: 'Get PRs by specific author',
    reasoning: 'Reviewing team contributions',
    owner: 'facebook',
    repo: 'react',
    author: 'gaearon',
    merged: true,
    limit: 10,
  }]
});
```

### Get full PR with comments

```typescript
const result = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Understand decision process',
    researchGoal: 'Get PR with review comments',
    reasoning: 'Understanding why changes were made',
    prNumber: 789,
    type: 'fullContent',
    withComments: true,
    withCommits: true,
  }]
});
```

## Workflow

```typescript
// Step 1: Find PRs (metadata first)
const search = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Find auth changes',
    researchGoal: 'Search PRs',
    reasoning: 'Locating relevant PRs',
    owner: 'myorg',
    repo: 'myrepo',
    query: 'auth',
    state: 'closed',
    merged: true,
    type: 'metadata',
  }]
});

// Step 2: Deep dive into specific PR
const details = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Review auth change',
    researchGoal: 'Get PR details',
    reasoning: 'Understanding implementation',
    prNumber: 123,  // From search results
    type: 'partialContent',
    partialContentMetadata: [{
      file: 'src/auth/middleware.ts',
    }],
    withComments: true,
  }]
});
```

## Tips

- **`prNumber` ignores all filters**: Use alone for specific PR lookup
- **Start with `type: "metadata"`**: Faster, then drill down
- **Avoid `fullContent` on large PRs**: Token expensive
- **Use `withComments: true`**: Understand WHY decisions were made
- **Filter by `merged: true`**: Focus on accepted changes

## Related Functions

- [`githubSearchCode`](./githubSearchCode.md) - Find code first
- [`githubGetFileContent`](./githubGetFileContent.md) - Read current state
- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Explore around changes
