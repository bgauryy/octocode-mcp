# githubSearchCode

Search code across GitHub repositories.

## Import

```typescript
import { githubSearchCode } from 'octocode-research';
```

## ⚠️ Requirements

- **GitHub token required**: Set `GITHUB_TOKEN` env var or use `gh auth login`
- **Initialize first**: Call `initialize()` before using

```typescript
import { initialize, getGitHubToken } from 'octocode-research';

await initialize();
const token = await getGitHubToken();
if (!token) {
  console.error('No GitHub token found');
}
```

## Input Type

```typescript
interface GitHubCodeSearchQuery {
  // Required
  keywordsToSearch: string[];   // 1-5 keywords
  
  // Research context (required for GitHub tools)
  mainResearchGoal: string;     // Overall objective
  researchGoal: string;         // Specific goal for this query
  reasoning: string;            // Why this approach
  
  // Scope filters (use 1-2 max!)
  owner?: string;               // Repository owner
  repo?: string;                // Repository name
  path?: string;                // Path prefix (strict!)
  extension?: string;           // File extension
  filename?: string;            // Filename pattern
  
  // Match mode
  match?: 'file' | 'path';      // "file" for content, "path" for names
  
  // Pagination
  limit?: number;               // Default: 10, max: 100
  page?: number;                // Default: 1, max: 10
}
```

## Output Type

```typescript
interface SearchResult {
  status?: 'hasResults' | 'empty' | 'error';
  files?: Array<{
    path: string;               // File path in repo
    repo?: string;              // owner/repo format
    text_matches?: string[];    // Matched snippets (only for match="file")
    lastModifiedAt?: string;
  }>;
  repositoryContext?: {
    owner: string;
    repo: string;
    branch?: string;            // Default branch
  };
  pagination?: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    totalMatches: number;       // Capped at 1000 by GitHub
    hasMore: boolean;
  };
  hints?: string[];
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
}
```

## Filter Guidelines

⚠️ **Use 1-2 filters max!** Never combine `extension` + `filename` + `path`.

| Filter | Use Case | Example |
|--------|----------|---------|
| `owner` + `repo` | Search specific repo | `owner: "facebook", repo: "react"` |
| `extension` | File type | `extension: "ts"` |
| `path` | Directory prefix | `path: "src/components"` |
| `filename` | Filename pattern | `filename: "index"` |

## Examples

### Search in specific repo

```typescript
import { githubSearchCode, initialize } from 'octocode-research';

await initialize();

const result = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Understand React hooks',
    researchGoal: 'Find useState implementation',
    reasoning: 'Need to understand state management',
    keywordsToSearch: ['useState', 'dispatcher'],
    owner: 'facebook',
    repo: 'react',
  }]
});
```

### Search all of GitHub

```typescript
const result = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find authentication patterns',
    researchGoal: 'Search for JWT implementations',
    reasoning: 'Research best practices',
    keywordsToSearch: ['jwt', 'verify', 'token'],
    extension: 'ts',
    limit: 20,
  }]
});
```

### Search by file path

```typescript
const result = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find API routes',
    researchGoal: 'Locate route handlers',
    reasoning: 'Understanding API structure',
    keywordsToSearch: ['router', 'endpoint'],
    owner: 'expressjs',
    repo: 'express',
    path: 'lib',
    match: 'file',
  }]
});
```

### Search for file names

```typescript
const result = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find config files',
    researchGoal: 'Locate configuration patterns',
    reasoning: 'Research config approaches',
    keywordsToSearch: ['config'],
    match: 'path',  // Search file names, not content
  }]
});
```

### Paginated results

```typescript
const result = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Research React patterns',
    researchGoal: 'Find useEffect examples',
    reasoning: 'Learning effect patterns',
    keywordsToSearch: ['useEffect', 'cleanup'],
    owner: 'facebook',
    repo: 'react',
    page: 2,
    limit: 50,
  }]
});
```

## Tips

- **Start lean**: Single filter → verify → add filters
- **Prefer `owner` + `repo`**: Most precise results
- **Use `text_matches`**: Get matched code snippets from results
- **GitHub caps at 1000**: `totalMatches` is capped by GitHub API
- **path is strict prefix**: `path: "pkg"` finds `pkg/file`, NOT `parent/pkg/file`

## Common Mistakes

```typescript
// ❌ BAD: Too many filters
{
  keywordsToSearch: ['auth'],
  extension: 'ts',
  filename: 'index',
  path: 'src',  // Will likely return empty!
}

// ✅ GOOD: Focused query
{
  keywordsToSearch: ['auth'],
  owner: 'myorg',
  repo: 'myrepo',
}
```

## Next Steps

After finding code:
- [`githubGetFileContent`](./githubGetFileContent.md) - Read matched files
- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Explore around matches

## Related Functions

- [`githubGetFileContent`](./githubGetFileContent.md) - Read files
- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Explore repo
- [`packageSearch`](./packageSearch.md) - Find package repo first
