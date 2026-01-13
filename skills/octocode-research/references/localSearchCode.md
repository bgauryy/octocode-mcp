# localSearchCode

Search code using ripgrep in local directories.

## Import

```typescript
import { localSearchCode } from 'octocode-research';
```

## Input Type

```typescript
interface RipgrepSearchQuery {
  // Required
  pattern: string;              // Regex pattern to search
  path: string;                 // Directory to search
  
  // Research context (recommended)
  researchGoal?: string;
  reasoning?: string;
  
  // Workflow mode presets
  mode?: 'discovery' | 'paginated' | 'detailed';
  
  // Pattern options
  fixedString?: boolean;        // Treat pattern as literal
  perlRegex?: boolean;          // Use PCRE2 regex
  smartCase?: boolean;          // Default: true
  caseInsensitive?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  invertMatch?: boolean;        // Show non-matching lines
  
  // File filtering
  type?: string;                // File type: "ts", "py", etc.
  include?: string[];           // Glob patterns: ["*.ts"]
  exclude?: string[];           // Exclude patterns: ["*.test.ts"]
  excludeDir?: string[];        // Exclude directories
  noIgnore?: boolean;           // Ignore .gitignore
  hidden?: boolean;             // Include hidden files
  followSymlinks?: boolean;
  
  // Output control
  filesOnly?: boolean;          // Return only file paths
  filesWithoutMatch?: boolean;  // Files NOT containing pattern
  count?: boolean;              // Return match counts only
  countMatches?: boolean;       // Count individual matches
  
  // Context lines
  contextLines?: number;        // Lines around matches (max: 50)
  beforeContext?: number;
  afterContext?: number;
  matchContentLength?: number;  // Max chars per match (default: 200)
  lineNumbers?: boolean;        // Default: true
  column?: boolean;             // Include column numbers
  
  // Pagination
  filesPerPage?: number;        // Default: 10, max: 20
  filePageNumber?: number;      // Default: 1
  matchesPerPage?: number;      // Default: 10, max: 100
  maxMatchesPerFile?: number;   // Max: 100
  maxFiles?: number;            // Max: 1000
  
  // Advanced
  multiline?: boolean;          // Multi-line patterns
  multilineDotall?: boolean;    // Dot matches newline
  binaryFiles?: 'text' | 'without-match' | 'binary';
  includeStats?: boolean;       // Default: true
  includeDistribution?: boolean; // Default: true
  jsonOutput?: boolean;
  vimgrepFormat?: boolean;
  threads?: number;             // Max: 32
  mmap?: boolean;
  noUnicode?: boolean;
  encoding?: string;
  sort?: 'path' | 'modified' | 'accessed' | 'created';
  sortReverse?: boolean;
  noMessages?: boolean;
  lineRegexp?: boolean;
  passthru?: boolean;
  debug?: boolean;
  showFileLastModified?: boolean;
}
```

## Output Type

```typescript
interface SearchContentResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  cwd?: string;
  errorCode?: string;
  hints?: string[];
  warnings?: string[];
  files?: Array<{
    path: string;
    matchCount: number;
    matches: Array<{
      value: string;
      location: {
        byteOffset: number;
        byteLength: number;
        charOffset: number;
        charLength: number;
      };
      line?: number;           // Use as lineHint for LSP tools!
      column?: number;
    }>;
    modified?: string;
    pagination?: {
      currentPage: number;
      totalPages: number;
      matchesPerPage: number;
      totalMatches: number;
      hasMore: boolean;
    };
  }>;
  totalMatches?: number;
  totalFiles?: number;
  pagination?: {
    currentPage: number;
    totalPages: number;
    filesPerPage: number;
    totalFiles: number;
    hasMore: boolean;
  };
  searchEngine?: 'rg' | 'grep';
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}
```

## Workflow Modes

| Mode | Purpose | Settings |
|------|---------|----------|
| `discovery` | Fast file discovery (25x faster) | `filesOnly: true`, `smartCase: true` |
| `paginated` | Paginated content with limits | `filesPerPage: 10`, `matchesPerPage: 10` |
| `detailed` | Full matches with context | `contextLines: 3`, `matchesPerPage: 20` |

## Examples

### Basic search

```typescript
import { localSearchCode } from 'octocode-research';

const result = await localSearchCode({
  queries: [{
    pattern: 'export async function',
    path: '/project/src',
  }]
});
```

### Fast file discovery

```typescript
const result = await localSearchCode({
  queries: [{
    pattern: 'authenticate',
    path: '/project/src',
    mode: 'discovery',  // Only returns file paths
  }]
});
```

### Filtered search with context

```typescript
const result = await localSearchCode({
  queries: [{
    pattern: 'class.*Service',
    path: '/project/src',
    include: ['*.ts'],
    exclude: ['*.test.ts', '*.spec.ts'],
    contextLines: 3,
    maxMatchesPerFile: 5,
    researchGoal: 'Find all service classes',
    reasoning: 'Understanding service layer architecture',
  }]
});
```

### Paginated results

```typescript
const result = await localSearchCode({
  queries: [{
    pattern: 'import',
    path: '/project/src',
    mode: 'paginated',
    filePageNumber: 2,  // Get second page
  }]
});
```

## Tips

- **Use `mode: 'discovery'`** for initial exploration - 25x faster than full content
- **Use `type` parameter** instead of `include` globs for known file types: `type: "ts"`
- **Consolidate globs**: Use `include: ["*.{ts,tsx}"]` instead of separate patterns
- **Get lineHint**: The `line` field in matches is required for LSP tools
- **Limit output**: Set `maxMatchesPerFile` to prevent output explosion

## Next Steps

After finding matches, use the `line` number as `lineHint` for:
- [`lspGotoDefinition`](./lspGotoDefinition.md) - Jump to definition
- [`lspFindReferences`](./lspFindReferences.md) - Find all usages
- [`lspCallHierarchy`](./lspCallHierarchy.md) - Trace call relationships
