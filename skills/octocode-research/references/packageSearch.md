# packageSearch

Search npm and PyPI packages to find repository URLs.

## Import

```typescript
import { packageSearch } from 'octocode-research';
```

## Use Case

**Find package → get repository URL → explore source code**.

This is often the first step when researching external packages.

## Input Type

```typescript
// NPM package query
interface NpmPackageSearchQuery {
  name: string;                 // Package name
  ecosystem: 'npm';
  
  // Research context (required)
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  
  // Options
  searchLimit?: number;         // Default: 1, max: 10 (use 5 for alternatives)
  npmFetchMetadata?: boolean;   // Fetch detailed npm metadata
}

// Python package query
interface PythonPackageSearchQuery {
  name: string;                 // Package name
  ecosystem: 'python';
  
  // Research context (required)
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  
  // Options
  searchLimit?: number;
  pythonFetchMetadata?: boolean;  // Fetch detailed PyPI metadata
}

type PackageSearchQuery = NpmPackageSearchQuery | PythonPackageSearchQuery;
```

## Output Type

```typescript
interface PackageSearchResult {
  status?: 'hasResults' | 'empty' | 'error';
  packages?: Array<{
    name: string;
    version?: string;
    description?: string;
    repository?: {
      type: string;
      url: string;              // Use this for source exploration!
    };
    homepage?: string;
    license?: string;
    deprecated?: boolean;       // Check this!
    deprecationMessage?: string;
    keywords?: string[];
    author?: string;
    maintainers?: string[];
  }>;
  hints?: string[];
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
}
```

## Examples

### Look up npm package

```typescript
import { packageSearch } from 'octocode-research';

const result = await packageSearch({
  queries: [{
    name: 'express',
    ecosystem: 'npm',
    mainResearchGoal: 'Research Express.js',
    researchGoal: 'Get repository URL',
    reasoning: 'Need to explore source code',
  }]
});

// Result includes:
// repository.url: "https://github.com/expressjs/express"
```

### Look up Python package

```typescript
const result = await packageSearch({
  queries: [{
    name: 'requests',
    ecosystem: 'python',
    mainResearchGoal: 'Research HTTP client',
    researchGoal: 'Evaluate requests library',
    reasoning: 'Comparing HTTP clients',
  }]
});
```

### Find alternatives

```typescript
const result = await packageSearch({
  queries: [{
    name: 'lodash',
    ecosystem: 'npm',
    mainResearchGoal: 'Find utility libraries',
    researchGoal: 'Discover lodash alternatives',
    reasoning: 'Evaluating bundle size',
    searchLimit: 5,  // Get multiple results
  }]
});
```

### With detailed metadata

```typescript
const result = await packageSearch({
  queries: [{
    name: 'axios',
    ecosystem: 'npm',
    mainResearchGoal: 'Research HTTP clients',
    researchGoal: 'Get axios details',
    reasoning: 'Evaluating for project',
    npmFetchMetadata: true,  // Include extra metadata
  }]
});
```

## Workflow: Package to Source

```typescript
import { 
  packageSearch, 
  githubViewRepoStructure, 
  githubSearchCode,
  githubGetFileContent 
} from 'octocode-research';

// Step 1: Find package info
const pkg = await packageSearch({
  queries: [{
    name: 'lodash',
    ecosystem: 'npm',
    mainResearchGoal: 'Research lodash',
    researchGoal: 'Get repo URL',
    reasoning: 'Need source access',
  }]
});
// Extract: repository.url → github.com/lodash/lodash

// Step 2: Explore structure
const structure = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Understand lodash',
    researchGoal: 'View project structure',
    reasoning: 'Finding implementation files',
    owner: 'lodash',
    repo: 'lodash',
    branch: 'main',
    path: '',
    depth: 1,
  }]
});

// Step 3: Search implementation
const code = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find lodash implementation',
    researchGoal: 'Search for debounce',
    reasoning: 'Understanding debounce impl',
    keywordsToSearch: ['debounce'],
    owner: 'lodash',
    repo: 'lodash',
  }]
});

// Step 4: Read specific file
const content = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read implementation',
    researchGoal: 'Get debounce code',
    reasoning: 'Studying implementation',
    owner: 'lodash',
    repo: 'lodash',
    path: 'debounce.js',
    fullContent: true,
  }]
});
```

## Tips

- **Check `deprecated` first**: Avoid deprecated packages
- **`searchLimit: 1` for known name**: Fastest lookup
- **`searchLimit: 5` for alternatives**: Compare options
- **Python returns 1 result**: PyPI API limitation
- **NPM uses dashes, Python uses underscores**: `my-package` vs `my_package`
- **Repository URL may need parsing**: Extract owner/repo from URL

## packageSearch vs githubSearchRepositories

| Use Case | Tool |
|----------|------|
| Known package name | `packageSearch` (faster) |
| Discover by topic | `githubSearchRepositories` |
| Find org repos | `githubSearchRepositories` |

## Related Functions

- [`githubViewRepoStructure`](./githubViewRepoStructure.md) - Explore package source
- [`githubSearchCode`](./githubSearchCode.md) - Search package code
- [`githubGetFileContent`](./githubGetFileContent.md) - Read package source
