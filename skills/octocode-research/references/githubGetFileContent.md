# githubGetFileContent

Read file content from GitHub repositories.

## Import

```typescript
import { githubGetFileContent } from 'octocode-research';
```

## ⚠️ Requirements

- **GitHub token required**: Set `GITHUB_TOKEN` env var or use `gh auth login`
- **Initialize first**: Call `initialize()` before using

## Input Type

```typescript
interface FileContentQuery {
  // Required
  owner: string;                // Repository owner
  repo: string;                 // Repository name
  path: string;                 // File path in repo
  
  // Research context (required)
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  
  // Options
  branch?: string;              // Branch NAME (not SHA!) Default: default branch
  
  // Choose ONE extraction method:
  
  // Option 1: Match string
  matchString?: string;         // Pattern to find
  matchStringContextLines?: number;  // Default: 5, max: 50
  
  // Option 2: Line range
  startLine?: number;           // 1-indexed
  endLine?: number;
  
  // Option 3: Full content
  fullContent?: boolean;        // Small files only! (300KB max)
  
  // Character pagination
  charOffset?: number;
  charLength?: number;          // Max: 50000
}
```

## Output Type

```typescript
interface ContentResult {
  status?: 'hasResults' | 'empty' | 'error';
  owner?: string;
  repo?: string;
  path?: string;
  content?: string;
  sha?: string;                 // File SHA
  url?: string;                 // GitHub URL
  branch?: string;
  totalLines?: number;
  extractedLines?: {
    start: number;
    end: number;
  };
  hints?: string[];
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
}
```

## Examples

### Read with match string

```typescript
import { githubGetFileContent, initialize } from 'octocode-research';

await initialize();

const result = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read React source',
    researchGoal: 'Get hooks implementation',
    reasoning: 'Understanding internal API',
    owner: 'facebook',
    repo: 'react',
    path: 'packages/react/src/ReactHooks.js',
    branch: 'main',
    matchString: 'export function',
    matchStringContextLines: 20,
  }]
});
```

### Read line range

```typescript
const result = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read Express source',
    researchGoal: 'Get router initialization',
    reasoning: 'Understanding routing setup',
    owner: 'expressjs',
    repo: 'express',
    path: 'lib/router/index.js',
    startLine: 1,
    endLine: 50,
  }]
});
```

### Read full file (small files only)

```typescript
const result = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read package config',
    researchGoal: 'Get dependencies',
    reasoning: 'Understanding project structure',
    owner: 'lodash',
    repo: 'lodash',
    path: 'package.json',
    fullContent: true,
  }]
});
```

### Read from specific branch

```typescript
const result = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read beta features',
    researchGoal: 'Check experimental API',
    reasoning: 'Evaluating upcoming features',
    owner: 'facebook',
    repo: 'react',
    path: 'packages/react/src/React.js',
    branch: 'canary',  // Use branch NAME, not SHA
    matchString: 'experimental',
  }]
});
```

### Large file with character pagination

```typescript
// First chunk
const result1 = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read large file',
    researchGoal: 'Get beginning of file',
    reasoning: 'File too large for full content',
    owner: 'microsoft',
    repo: 'TypeScript',
    path: 'src/compiler/checker.ts',
    charOffset: 0,
    charLength: 10000,
  }]
});

// Next chunk
const result2 = await githubGetFileContent({
  queries: [{
    // ... same context
    charOffset: 10000,
    charLength: 10000,
  }]
});
```

## Tips

- **Use `matchString`** for large files - more efficient than `fullContent`
- **Branch is NAME, not SHA**: Use `"main"`, `"master"`, not commit hash
- **300KB max file size**: Larger files return `FILE_TOO_LARGE` error
- **Choose ONE method**: Cannot combine `startLine/endLine` with `matchString` or `fullContent`
- **Use text_matches from search**: After `githubSearchCode`, use `text_matches` as `matchString`

## Workflow

```typescript
// 1. Search for code
const search = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find implementation',
    researchGoal: 'Search for pattern',
    reasoning: 'Locating code',
    keywordsToSearch: ['useState'],
    owner: 'facebook',
    repo: 'react',
  }]
});

// 2. Read matched file
const content = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read implementation',
    researchGoal: 'Get useState code',
    reasoning: 'Understanding implementation',
    owner: 'facebook',
    repo: 'react',
    path: 'packages/react/src/ReactHooks.js',  // From search results
    matchString: 'useState',
    matchStringContextLines: 30,
  }]
});
```

## Related Functions

- [`githubSearchCode`](./githubSearchCode.md) - Search before reading
- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Find file paths
- [`githubSearchPullRequests`](./githubSearchPullRequests.md) - Find file history
