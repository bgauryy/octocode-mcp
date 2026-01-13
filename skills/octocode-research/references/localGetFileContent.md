# localGetFileContent

Read file content from local filesystem.

## Import

```typescript
import { localGetFileContent } from 'octocode-research';
```

## Input Type

```typescript
interface FetchContentQuery {
  // Required
  path: string;                 // Absolute file path
  
  // Research context
  researchGoal?: string;
  reasoning?: string;
  
  // Choose ONE extraction method:
  
  // Option 1: Match string search
  matchString?: string;         // Pattern to find
  matchStringContextLines?: number;  // Default: 5, max: 50
  matchStringIsRegex?: boolean;      // Default: false
  matchStringCaseSensitive?: boolean; // Default: false
  
  // Option 2: Line range
  startLine?: number;           // 1-indexed start
  endLine?: number;             // 1-indexed end (inclusive)
  
  // Option 3: Full content
  fullContent?: boolean;        // Entire file (small files only)
  
  // Character-level pagination
  charOffset?: number;
  charLength?: number;          // Max: 10000
}
```

## Output Type

```typescript
interface FetchContentResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  cwd?: string;
  content?: string;
  contentLength?: number;
  isPartial?: boolean;
  totalLines?: number;
  minificationFailed?: boolean;
  errorCode?: string;
  hints?: string[];
  warnings?: string[];
  startLine?: number;
  endLine?: number;
  extractedLines?: number;
  matchRanges?: Array<{ start: number; end: number }>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    charOffset?: number;
    charLength?: number;
    totalChars?: number;
  };
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}
```

## Extraction Methods

| Method | Use Case | Parameters |
|--------|----------|------------|
| Match string | Find specific pattern | `matchString`, `matchStringContextLines` |
| Line range | Known line numbers | `startLine`, `endLine` |
| Full content | Small config files | `fullContent: true` |
| Char pagination | Large files | `charOffset`, `charLength` |

## Examples

### Read with match string

```typescript
import { localGetFileContent } from 'octocode-research';

const result = await localGetFileContent({
  queries: [{
    path: '/project/src/index.ts',
    matchString: 'export class',
    matchStringContextLines: 20,
  }]
});
```

### Read line range

```typescript
const result = await localGetFileContent({
  queries: [{
    path: '/project/src/service.ts',
    startLine: 40,
    endLine: 80,
  }]
});
```

### Read full file (small files only)

```typescript
const result = await localGetFileContent({
  queries: [{
    path: '/project/package.json',
    fullContent: true,
  }]
});
```

### Paginated reading for large files

```typescript
// First chunk
const result1 = await localGetFileContent({
  queries: [{
    path: '/project/src/large-file.ts',
    charOffset: 0,
    charLength: 5000,
  }]
});

// Next chunk
const result2 = await localGetFileContent({
  queries: [{
    path: '/project/src/large-file.ts',
    charOffset: 5000,
    charLength: 5000,
  }]
});
```

### Regex match

```typescript
const result = await localGetFileContent({
  queries: [{
    path: '/project/src/api.ts',
    matchString: 'async function \\w+',
    matchStringIsRegex: true,
    matchStringContextLines: 10,
  }]
});
```

## Tips

- **Use `matchString`** for targeted extraction - more efficient than `fullContent`
- **Choose ONE method**: Cannot combine `startLine/endLine` with `matchString` or `fullContent`
- **startLine/endLine must be used together**: Both are required for line range extraction
- **Line numbers are 1-indexed**: First line is line 1, not line 0
- **Use for implementation details**: This should be your LAST step after LSP analysis

## Validation Rules

1. `startLine` and `endLine` must be used together
2. `startLine` must be ≤ `endLine`
3. Cannot use line range with `matchString`
4. Cannot use line range with `fullContent`

## Related Functions

- [`localSearchCode`](./localSearchCode.md) - Search before reading
- [`localViewStructure`](./localViewStructure.md) - Find files first
