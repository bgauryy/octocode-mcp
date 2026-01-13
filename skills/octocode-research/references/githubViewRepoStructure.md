# githubViewRepoStructure

Explore repository directory structure on GitHub.

## Import

```typescript
import { githubViewRepoStructure } from 'octocode-research';
```

## ⚠️ Requirements

- **GitHub token required**: Set `GITHUB_TOKEN` env var or use `gh auth login`
- **Initialize first**: Call `initialize()` before using

## Input Type

```typescript
interface GitHubViewRepoStructureQuery {
  // Required
  owner: string;                // Repository owner
  repo: string;                 // Repository name
  branch: string;               // Branch NAME (not SHA!)
  
  // Research context (required)
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  
  // Options
  path?: string;                // Subdirectory (default: root "")
  depth?: number;               // 1 or 2 (default: 1)
  entriesPerPage?: number;      // Max: 200
  entryPageNumber?: number;     // Default: 1
}
```

## Output Type

```typescript
interface RepoStructureResult {
  status?: 'hasResults' | 'empty' | 'error';
  owner?: string;
  repo?: string;
  path?: string;
  branch?: string;
  entries?: Array<{
    name: string;
    type: 'file' | 'dir';
    size?: number;
    path: string;
  }>;
  summary?: {
    totalEntries: number;
    truncated: boolean;
  };
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

## Examples

### View root structure

```typescript
import { githubViewRepoStructure, initialize } from 'octocode-research';

await initialize();

const result = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Understand project layout',
    researchGoal: 'View root directory',
    reasoning: 'Need to find source files',
    owner: 'facebook',
    repo: 'react',
    branch: 'main',
    path: '',
    depth: 1,
  }]
});
```

### Drill into subdirectory

```typescript
const result = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Understand React packages',
    researchGoal: 'View packages directory',
    reasoning: 'Finding package structure',
    owner: 'facebook',
    repo: 'react',
    branch: 'main',
    path: 'packages',
    depth: 2,  // Show subdirs of packages
  }]
});
```

### Monorepo exploration

```typescript
// Step 1: View packages root
const packages = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Explore monorepo',
    researchGoal: 'List all packages',
    reasoning: 'Understanding monorepo structure',
    owner: 'org',
    repo: 'monorepo',
    branch: 'main',
    path: 'packages',
    depth: 1,
  }]
});

// Step 2: Drill into specific package
const core = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Explore core package',
    researchGoal: 'View core package structure',
    reasoning: 'Understanding core implementation',
    owner: 'org',
    repo: 'monorepo',
    branch: 'main',
    path: 'packages/core/src',
    depth: 2,
  }]
});
```

### Paginated results

```typescript
const result = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'View large directory',
    researchGoal: 'Get second page',
    reasoning: 'Directory has many files',
    owner: 'microsoft',
    repo: 'TypeScript',
    branch: 'main',
    path: 'src/compiler',
    entryPageNumber: 2,
    entriesPerPage: 100,
  }]
});
```

## Exploration Workflow

```
1. Root (path="", depth=1)    → Get overview
2. Identify key directories   → Look for src/, lib/, packages/
3. Drill (path="src", depth=2) → Explore source
4. Search or read             → Find specific code
```

## Tips

- **Start at root** with `path: ""` and `depth: 1`
- **depth=2 is slow** on large directories - use on subdirs
- **Monorepos**: Check `packages/`, `apps/`, `libs/`
- **Auto-filters noisy dirs**: `.git`, `node_modules`, `dist` excluded
- **Max 200 items**: Check `summary.truncated` if results cut off
- **Use branch NAME**: `"main"`, not commit SHA

## Common Paths to Explore

| Project Type | Key Paths |
|--------------|-----------|
| Library | `src/`, `lib/` |
| Monorepo | `packages/`, `apps/` |
| React app | `src/components/`, `src/hooks/` |
| API | `src/routes/`, `src/controllers/` |
| CLI | `src/commands/`, `bin/` |

## Next Steps

After viewing structure:
- [`githubSearchCode`](./githubSearchCode.md) - Search in discovered dirs
- [`githubGetFileContent`](./githubGetFileContent.md) - Read discovered files
- [`githubSearchPullRequests`](./githubSearchPullRequests.md) - Find changes

## Related Functions

- [`githubSearchRepositories`](./githubSearchRepositories.md) - Find repos first
- [`githubSearchCode`](./githubSearchCode.md) - Search code
- [`githubGetFileContent`](./githubGetFileContent.md) - Read files
