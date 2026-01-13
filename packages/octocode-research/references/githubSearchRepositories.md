# githubSearchRepositories

Find GitHub repositories by topic or keyword.

## Import

```typescript
import { githubSearchRepositories } from 'octocode-research';
```

## ⚠️ Requirements

- **GitHub token required**: Set `GITHUB_TOKEN` env var or use `gh auth login`
- **Initialize first**: Call `initialize()` before using

## Input Type

```typescript
interface GitHubReposSearchQuery {
  // Research context (required)
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  
  // Search (use one or both)
  topicsToSearch?: string[];    // Repository topics: ["typescript", "cli"]
  keywordsToSearch?: string[];  // Keywords in name/description
  
  // Filters
  owner?: string;               // Filter by owner/org
  stars?: string;               // Stars: ">1000", "100..500"
  created?: string;             // Created date range
  updated?: string;             // Updated date range
  
  // Options
  match?: ('name' | 'description' | 'readme')[];  // Where to match
  sort?: 'stars' | 'forks' | 'updated' | 'best-match';
  limit?: number;               // Default: 10, max: 100
  page?: number;                // Default: 1, max: 10
}
```

## Output Type

```typescript
interface RepoSearchResult {
  status?: 'hasResults' | 'empty' | 'error';
  totalCount?: number;
  repositories?: Array<{
    fullName: string;           // owner/repo
    description?: string;
    stars: number;
    forks?: number;
    language?: string;
    topics?: string[];
    pushedAt?: string;          // Last code push (more useful than updatedAt)
    updatedAt?: string;         // Last metadata update
    url: string;
    defaultBranch?: string;
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

## Search Strategies

| Strategy | Use Case | Example |
|----------|----------|---------|
| Topics | Open-source discovery | `topicsToSearch: ["typescript", "testing"]` |
| Keywords | Org repos, specific names | `owner: "myorg", keywordsToSearch: ["auth"]` |
| Stars filter | Popular projects | `stars: ">1000"` |

## Examples

### Search by topics

```typescript
import { githubSearchRepositories, initialize } from 'octocode-research';

await initialize();

const result = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Find TypeScript CLI tools',
    researchGoal: 'Discover popular CLI frameworks',
    reasoning: 'Research alternatives for our CLI',
    topicsToSearch: ['typescript', 'cli'],
    stars: '>1000',
    sort: 'stars',
  }]
});
```

### Search by keywords

```typescript
const result = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Find React state libraries',
    researchGoal: 'Research state management',
    reasoning: 'Evaluating alternatives to Redux',
    keywordsToSearch: ['react', 'state', 'management'],
    sort: 'stars',
    limit: 20,
  }]
});
```

### Search within organization

```typescript
const result = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Find org services',
    researchGoal: 'Locate authentication service',
    reasoning: 'Need to integrate with auth',
    owner: 'myorg',
    keywordsToSearch: ['auth', 'service'],
  }]
});
```

### Filter by activity

```typescript
const result = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Find active projects',
    researchGoal: 'Recent TypeScript libraries',
    reasoning: 'Want maintained projects',
    topicsToSearch: ['typescript'],
    updated: '>2024-01-01',
    stars: '>100',
  }]
});
```

### Match in specific fields

```typescript
const result = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Find GraphQL tools',
    researchGoal: 'Search in README',
    reasoning: 'README often has better descriptions',
    keywordsToSearch: ['graphql', 'client'],
    match: ['readme'],  // Only search README
  }]
});
```

## Tips

- **Check `pushedAt`** over `updatedAt`: Code change vs metadata change
- **Use `stars: ">1000"`** to filter noise (may hide new projects)
- **Try synonyms**: `auth` ↔ `authentication`, `plugin` ↔ `extension`
- **Archived repos auto-excluded**: Only active repos returned

## Next Steps

After finding a repository:
- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Explore structure
- [`githubSearchCode`](./githubSearchCode.md) - Search code in repo
- [`githubGetFileContent`](./githubGetFileContent.md) - Read files

## packageSearch vs githubSearchRepositories

| Use Case | Tool |
|----------|------|
| Known package name (lodash, express) | `packageSearch` |
| Broad discovery by topic | `githubSearchRepositories` |
| Organization repos | `githubSearchRepositories` |

## Related Functions

- [`packageSearch`](./packageSearch.md) - Find package → repo URL
- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Explore found repos
- [`githubSearchCode`](./githubSearchCode.md) - Search code
