# Octocode MCP Hints Architecture

> Complete guide to the hints system: flow, sources, types, and implementation

## Overview

The hints system provides context-aware guidance to AI agents using Octocode MCP tools. Hints help agents:
- Choose the right next tool
- Recover from empty results
- Handle errors appropriately
- Navigate pagination
- Optimize token usage

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HINTS FLOW DIAGRAM                                │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────┐
                    │   Remote API (Static)    │
                    │ octocodeai.com/api/      │
                    │     mcpContent           │
                    └───────────┬──────────────┘
                                │
                                │ fetchWithRetries()
                                ▼
                    ┌──────────────────────────┐
                    │    toolMetadata.ts       │
                    │  ┌────────────────────┐  │
                    │  │   METADATA_JSON    │  │
                    │  │ ├─ baseHints       │  │
                    │  │ ├─ tools[].hints   │  │
                    │  │ └─ genericErrors   │  │
                    │  └────────────────────┘  │
                    └───────────┬──────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │    static.ts      │   │    dynamic.ts     │
        │  getStaticHints() │   │  getDynamicHints()│
        │                   │   │  HINTS object     │
        │  baseHints +      │   │  Context-aware    │
        │  tool hints       │   │  generators       │
        └─────────┬─────────┘   └─────────┬─────────┘
                  │                       │
                  └───────────┬───────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │      index.ts         │
                  │    getHints()         │
                  │                       │
                  │  static + dynamic     │
                  │  → deduplicated       │
                  └───────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
    ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
    │  Tool Files     │ │   bulk.ts   │ │   utils.ts      │
    │ local_ripgrep   │ │ Aggregates  │ │ createResult()  │
    │ local_fetch...  │ │ hints from  │ │                 │
    │ github_search...│ │ all results │ │                 │
    └────────┬────────┘ └──────┬──────┘ └────────┬────────┘
             │                 │                  │
             └─────────────────┼──────────────────┘
                               │
                               ▼
                  ┌───────────────────────┐
                  │    createSuccessResult│   ← All tools call this
                  │  (utils.ts)           │
                  │                       │
                  │  + hintContext        │   ← Dynamic context
                  │  + extraHints         │   ← Tool-specific (pagination, etc.)
                  └───────────┬───────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │    Tool Response      │
                  │ ┌───────────────────┐ │
                  │ │ hints: string[]   │ │   ← Combined & deduplicated
                  │ └───────────────────┘ │
                  └───────────────────────┘
```

---

## File Structure

```
packages/octocode-mcp/src/
├── tools/
│   ├── hints/                    # 🎯 HINTS MODULE
│   │   ├── index.ts             # Entry point - getHints()
│   │   ├── types.ts             # Re-exports from types/metadata.ts
│   │   ├── static.ts            # Loads from toolMetadata + getMetadataDynamicHints()
│   │   ├── dynamic.ts           # Context-aware HINTS object (all 13 tools)
│   │   └── localBaseHints.ts    # Local tool base hints constants
│   │
│   ├── utils.ts                 # 🎯 createSuccessResult() - MAIN ENTRY POINT
│   ├── toolMetadata.ts          # Fetches remote JSON, exports getToolHintsSync
│   ├── toolNames.ts             # STATIC_TOOL_NAMES constants
│   │
│   ├── local_ripgrep.ts         # Uses createSuccessResult()
│   ├── local_fetch_content.ts   # Uses createSuccessResult()
│   ├── local_view_structure.ts  # Uses createSuccessResult()
│   ├── local_find_files.ts      # Uses createSuccessResult()
│   ├── lsp_goto_definition.ts   # Uses createSuccessResult()
│   ├── lsp_find_references.ts   # Uses createSuccessResult()
│   ├── lsp_call_hierarchy.ts    # Uses createSuccessResult()
│   ├── github_*.ts              # Uses createSuccessResult()
│   └── package_search.ts        # Uses createSuccessResult()
│
├── types/
│   └── metadata.ts              # HintContext, HintStatus, ToolHintGenerators
│
└── utils/
    └── response/
        ├── bulk.ts              # Aggregates hints across bulk results
        └── error.ts             # Error hints handling
```

---

## Hint Sources

### 1. Remote Static Hints (from API)

**Source**: `https://octocodeai.com/api/mcpContent`

**Loaded by**: `toolMetadata.ts` → `initializeToolMetadata()`

**Structure**:
```typescript
{
  baseHints: {
    hasResults: string[],  // Shared hints for all tools
    empty: string[]        // Shared empty hints
  },
  tools: {
    [toolName]: {
      hints: {
        hasResults: string[],  // Tool-specific success hints
        empty: string[],       // Tool-specific empty hints
        dynamic?: {            // Optional dynamic hint keys
          [key: string]: string[]
        }
      }
    }
  },
  genericErrorHints: string[]
}
```

**Example static hints**:
```typescript
// baseHints.hasResults
[
  "Use 'owner', 'repo', 'branch', 'path' fields directly in next tool calls",
  "Follow 'mainResearchGoal', 'researchGoal', 'reasoning', 'hints' to navigate research",
  "Do findings answer your question? If partial, identify gaps and continue",
  "Got 3+ examples? Consider stopping to avoid over-research",
  "Check `pushedAt`/`lastModified` - skip stale content"
]

// baseHints.empty
[
  "Try broader terms or related concepts",
  "Remove filters one at a time to find what blocks results",
  "Separate concerns into multiple simpler queries",
  "TOOL TRANSITION: packageSearch ↔ GitHub tools, githubSearchCode ↔ githubSearchRepositories",
  "<AGENT_INSTRUCTION>If stuck in loop - STOP and ask user</AGENT_INSTRUCTION>"
]
```

### 2. Dynamic Hints (Context-Aware)

**Source**: `hints/dynamic.ts` → `HINTS` object

**Generated at**: Runtime, based on `HintContext`

**Context Properties**:
```typescript
interface HintContext {
  // Common properties
  fileSize?: number;           // File size in bytes
  resultSize?: number;         // Result size
  tokenEstimate?: number;      // Estimated tokens
  entryCount?: number;         // Directory entries
  matchCount?: number;         // Search matches
  fileCount?: number;          // Files found
  isLarge?: boolean;           // Large file/result flag
  originalError?: string;
  hasPattern?: boolean;        // Has matchString
  hasPagination?: boolean;     // Using pagination
  path?: string;
  
  // Error types
  errorType?: 
    | 'size_limit' 
    | 'not_found' 
    | 'permission' 
    | 'pattern_too_broad'
    | 'symbol_not_found'       // LSP: symbol not found
    | 'file_not_found'         // LSP: file not found
    | 'timeout'                // LSP: server timeout
    | 'not_a_function';        // LSP: not a callable symbol
  
  // GitHub-specific
  hasOwnerRepo?: boolean;      // GitHub: has owner/repo
  match?: 'file' | 'path';     // GitHub: search mode
  
  // Local-specific
  searchEngine?: 'rg' | 'grep'; // Local: which engine
  
  // LSP-specific
  locationCount?: number;      // Number of definitions/references found
  hasExternalPackage?: boolean; // Definition in node_modules
  isFallback?: boolean;        // Using text-search fallback
  searchRadius?: number;       // Lines searched around lineHint
  lineHint?: number;           // Original line hint provided
  symbolName?: string;         // Symbol being searched
  uri?: string;                // File URI
  hasMultipleFiles?: boolean;  // References span multiple files
  hasMorePages?: boolean;      // Pagination available
  currentPage?: number;        // Current page number
  totalPages?: number;         // Total pages
  direction?: 'incoming' | 'outgoing'; // Call hierarchy direction
  callCount?: number;          // Number of calls found
  depth?: number;              // Call hierarchy depth
  hasMoreContent?: boolean;    // More content available
}
```

---

## Hint Types

### HintStatus
```typescript
type HintStatus = 'hasResults' | 'empty' | 'error';
```

### HintGenerator
```typescript
type HintGenerator = (context: HintContext) => (string | undefined)[];
```

### ToolHintGenerators
```typescript
interface ToolHintGenerators {
  hasResults: HintGenerator;
  empty: HintGenerator;
  error: HintGenerator;
}
```

---

## How Hints Are Generated

### Step 1: Tool calls `createSuccessResult()`

```typescript
// In local_ripgrep.ts (and all tools)
import { createSuccessResult } from './utils.js';

// When building response:
return createSuccessResult(
  query,
  { files, matches, pagination },
  hasContent,
  TOOL_NAMES.LOCAL_RIPGREP,
  {
    hintContext: {
      fileCount: files.length,
      matchCount: totalMatches,
      searchEngine: 'rg'
    },
    extraHints: paginationHints  // Tool-specific hints
  }
);
```

### Step 1b: `createSuccessResult()` calls `getHints()`

```typescript
// utils.ts
export function createSuccessResult<T>(
  query: {...},
  data: T,
  hasContent: boolean,
  toolName: string,
  options?: SuccessResultOptions
): ToolSuccessResult<T> & T {
  const status = hasContent ? 'hasResults' : 'empty';
  
  // Get static + dynamic hints
  const hints = getHints(toolName, status, options?.hintContext);
  const extraHints = options?.extraHints || [];
  
  // Combine, deduplicate, and filter empty/whitespace-only hints
  const allHints = [...new Set([...hints, ...extraHints])].filter(
    (h) => h && h.trim().length > 0
  );
  
  return { status, ...data, hints: allHints };
}
```

### Step 2: `getHints()` combines sources

```typescript
// hints/index.ts
export function getHints(
  toolName: string,
  status: HintStatus,
  context?: HintContext
): string[] {
  // 1. Get static hints from metadata
  const staticHints = getStaticHints(toolName, status);
  
  // 2. Get dynamic hints if available
  const dynamicHints = hasDynamicHints(toolName)
    ? getDynamicHints(toolName, status, context)
    : [];
  
  // 3. Combine and deduplicate
  const allHints = [...staticHints, ...dynamicHints];
  return [...new Set(allHints)];
}
```

### Step 3: Static hints from metadata

```typescript
// hints/static.ts
export function getStaticHints(
  toolName: string,
  status: HintStatus
): readonly string[] {
  if (status === 'error') return [];
  return getToolHintsSync(toolName, status);
}

// Also exports getMetadataDynamicHints for dynamic.ts to use
export function getMetadataDynamicHints(
  toolName: string,
  hintType: string
): readonly string[] {
  return getStaticDynamicHints(toolName, hintType);
}

// toolMetadata.ts
export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  // Local tools use LOCAL_BASE_HINTS, remote tools use METADATA_JSON.baseHints
  const baseHints = isLocalTool(toolName)
    ? (LOCAL_BASE_HINTS[resultType] ?? [])
    : (METADATA_JSON.baseHints[resultType] ?? []);
  const toolHints = METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}

// Fetches dynamic hints by key from tools[toolName].hints.dynamic[hintType]
export function getDynamicHints(
  toolName: string,
  hintType: string
): readonly string[] {
  return METADATA_JSON.tools[toolName]?.hints?.dynamic?.[hintType] ?? [];
}
```

### Step 4: Dynamic hints from context

Dynamic hints use `getMetadataDynamicHints()` to fetch hint text from the remote API, keeping hint content centralized and updatable without code changes:

```typescript
// hints/dynamic.ts
import { getMetadataDynamicHints } from './static.js';

export const HINTS: Record<string, ToolHintGenerators> = {
  [STATIC_TOOL_NAMES.LOCAL_RIPGREP]: {
    hasResults: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      
      // Conditional hints fetch from metadata by key
      if (ctx.searchEngine === 'grep') {
        hints.push(...getMetadataDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'grepFallback'));
      }
      if (ctx.fileCount && ctx.fileCount > 5) {
        hints.push(...getMetadataDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'parallelTip'));
      }
      if (ctx.fileCount && ctx.fileCount > 1) {
        hints.push(...getMetadataDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'multipleFiles'));
      }
      return hints;
    },
    empty: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      if (ctx.searchEngine === 'grep') {
        hints.push(...getMetadataDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'grepFallbackEmpty'));
      }
      return hints;
    },
    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
          ...(ctx.path?.includes('node_modules') 
            ? getMetadataDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'nodeModulesSearch') 
            : []),
          ...getMetadataDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'largeResult'),
        ];
      }
      return [];
    },
  },
  // ... 12 more tools (LOCAL_*, GITHUB_*, LSP_*, PACKAGE_SEARCH) ...
};

export function getDynamicHints(
  toolName: string,
  status: HintStatus,
  context?: HintContext
): string[] {
  const hintGenerator = HINTS[toolName]?.[status];
  if (!hintGenerator) return [];
  
  const rawHints = hintGenerator(context || {});
  return rawHints.filter((h): h is string => typeof h === 'string');
}
```

The `getMetadataDynamicHints()` function fetches hint text from the remote API's `tools[toolName].hints.dynamic[hintKey]` field, enabling hint content updates without code deployments.

---

## Bulk Operations Aggregation

When tools return multiple results (bulk queries), hints are aggregated:

```typescript
// utils/response/bulk.ts
function createBulkResponse(...) {
  const hasResultsHintsSet = new Set<string>();
  const emptyHintsSet = new Set<string>();
  const errorHintsSet = new Set<string>();

  results.forEach(r => {
    const hintsArray = r.result.hints;
    
    if (r.result.status === 'hasResults' && hintsArray) {
      hintsArray.forEach(hint => hasResultsHintsSet.add(hint));
    } else if (r.result.status === 'empty' && hintsArray) {
      hintsArray.forEach(hint => emptyHintsSet.add(hint));
    } else if (r.result.status === 'error' && hintsArray) {
      hintsArray.forEach(hint => errorHintsSet.add(hint));
    }
  });

  // Final response structure
  return {
    results: [...],
    hasResultsStatusHints: [...hasResultsHintsSet],
    emptyStatusHints: [...emptyHintsSet],
    errorStatusHints: [...errorHintsSet],
  };
}
```

---

## Per-Tool Dynamic Hints

> **Note**: This section documents the **dynamic hints** from `hints/dynamic.ts` only. These are context-aware hints generated based on `HintContext` properties. Static hints from the remote API (baseHints + tool-specific hints) are always included in addition to these dynamic hints. Entries marked "(from metadata)" fetch their content via `getMetadataDynamicHints()`.

### LOCAL_RIPGREP
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `searchEngine === 'grep'` | Grep fallback warning (from metadata) |
| hasResults | `fileCount > 5` | Parallel queries tip (from metadata) |
| hasResults | `fileCount > 1` | Multiple files hint (from metadata) |
| empty | `searchEngine === 'grep'` | Grep doesn't respect .gitignore (from metadata) |
| error | `errorType === 'size_limit'` | Too many results (N matches), narrow scope |
| error | `errorType === 'size_limit' && path includes 'node_modules'` | Node modules search hints |

### LOCAL_FETCH_CONTENT
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `hasMoreContent` | More content available - use charOffset for pagination |
| empty | - | (No dynamic hints) |
| error | `errorType === 'size_limit' && isLarge` | Large file (~N tokens), use matchString |
| error | `errorType === 'pattern_too_broad'` | Pattern too broad (~N tokens) |

### LOCAL_VIEW_STRUCTURE
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `entryCount > 10` | Parallelize across directories (from metadata) |
| empty | - | (No dynamic hints) |
| error | `errorType === 'size_limit' && entryCount` | Directory has N entries (~N tokens) |

### LOCAL_FIND_FILES
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `fileCount > 3` | Batch in parallel (from metadata) |
| hasResults | `fileCount > 20` | Additional hints from metadata |
| hasResults | `hasConfigFiles` | Config files hints from metadata |
| empty | - | (No dynamic hints) |
| error | - | (No dynamic hints) |

### GITHUB_SEARCH_CODE
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `hasOwnerRepo` | Single repo, use githubGetFileContent |
| hasResults | `!hasOwnerRepo` | Multiple repos, check owners first |
| empty | `match === 'path'` | Path searches names only |
| empty | `!hasOwnerRepo` | Cross-repo needs unique keywords |

### GITHUB_FETCH_CONTENT
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `isLarge` | Use matchString for large files |
| error | `errorType === 'size_limit'` | FILE_TOO_LARGE recovery |

### GITHUB_VIEW_REPO_STRUCTURE
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `entryCount > 50` | Large directory pagination |

### GITHUB_SEARCH_REPOSITORIES
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | - | Static hints only (metadata dynamic via `extraHints`) |
| empty | - | Static hints + metadata dynamic (topics/keywords via `extraHints`) |

### GITHUB_SEARCH_PULL_REQUESTS
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | - | Static hints only (covers common cases) |
| empty | - | Static hints only |

### PACKAGE_SEARCH
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | - | Tool-generated hints via `extraHints` (deprecation, install, explore) |
| empty | - | Tool-generated hints via `extraHints` |

### LSP_GOTO_DEFINITION
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `locationCount > 1` | Multiple definitions found |
| hasResults | `hasExternalPackage` | Definition in external package |
| hasResults | `isFallback` | Using text-search fallback mode |
| empty | `searchRadius` | Searched ±N lines from lineHint |
| empty | `symbolName` | Symbol not found suggestions |
| error | `errorType === 'symbol_not_found'` | Symbol not at expected line |
| error | `errorType === 'file_not_found'` | File path not found |
| error | `errorType === 'timeout'` | LSP server timeout |

### LSP_FIND_REFERENCES
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `locationCount > 20` | Many references found |
| hasResults | `hasMultipleFiles` | References span multiple files |
| hasResults | `hasMorePages` | Pagination available |
| hasResults | `isFallback` | Using text-search fallback mode |
| empty | `symbolName` | Symbol not found suggestions |
| error | `errorType === 'symbol_not_found'` | Symbol not found |
| error | `errorType === 'timeout'` | LSP server timeout |

### LSP_CALL_HIERARCHY
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `direction === 'incoming'` | Found N callers |
| hasResults | `direction === 'outgoing'` | Found N callees |
| hasResults | `depth > 1` | Multi-level hierarchy |
| hasResults | `hasMorePages` | More calls via pagination |
| hasResults | `isFallback` | Using text-search fallback mode |
| empty | `symbolName` | Symbol not found suggestions |
| error | `errorType === 'not_a_function'` | Symbol is not callable |
| error | `errorType === 'timeout'` | LSP server timeout |

---

## Special Hints

### Large File Workflow Hints

```typescript
// hints/dynamic.ts
export function getLargeFileWorkflowHints(
  context: 'search' | 'read'
): string[] {
  if (context === 'search') {
    return [
      'Large codebase: avoid floods.',
      'Flow: localSearchCode filesOnly → add type/path filters → localGetFileContent matchString → localSearchCode links.',
      'Parallelize where safe.',
    ];
  }
  return [
    "Large file: don't read all.",
    'Flow: localGetFileContent matchString → analyze → localSearchCode usages/imports → localGetFileContent related.',
    'Use charLength to paginate if needed.',
    'Avoid fullContent without charLength.',
  ];
}
```

### Pagination Hints (Generated Separately)

Pagination hints are generated by `utils/pagination/index.ts` and added alongside tool hints:

```typescript
// Example pagination hints
[
  "Page 1/5 (showing 3 of 13)",
  "Total: 25 matches across 13 files",
  "Next: filePageNumber=2"
]
```

---

## Adding New Hints

### 1. Add Static Hints (via API)

Update the remote API at `octocodeai.com/api/mcpContent`:

```json
{
  "tools": {
    "yourToolName": {
      "hints": {
        "hasResults": ["Your static success hint"],
        "empty": ["Your static empty hint"],
        "dynamic": {
          "specialCase": ["Special case hints"]
        }
      }
    }
  }
}
```

### 2. Add Dynamic Hints (in code)

Edit `hints/dynamic.ts`. Use `getMetadataDynamicHints()` to fetch hint text from the API when possible:

```typescript
import { getMetadataDynamicHints } from './static.js';

export const HINTS: Record<string, ToolHintGenerators> = {
  // ...existing tools...
  
  [STATIC_TOOL_NAMES.YOUR_NEW_TOOL]: {
    hasResults: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      
      // Fetch hints from API metadata by key
      if (ctx.someCondition) {
        hints.push(...getMetadataDynamicHints(STATIC_TOOL_NAMES.YOUR_NEW_TOOL, 'someConditionKey'));
      }
      
      return hints;
    },
    empty: (ctx: HintContext = {}) => {
      // Can also return inline hints for dynamic values
      return ctx.symbolName 
        ? [`Symbol "${ctx.symbolName}" not found.`]
        : [];
    },
    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          `Too large${ctx.tokenEstimate ? ` (~${ctx.tokenEstimate} tokens)` : ''}.`,
          ...getMetadataDynamicHints(STATIC_TOOL_NAMES.YOUR_NEW_TOOL, 'sizeLimitRecovery'),
        ];
      }
      return [];
    },
  },
};
```

### 3. Use Hints in Tool

```typescript
import { getHints } from './hints/index.js';

// In your tool handler:
return {
  status: 'hasResults',
  data: yourData,
  hints: getHints(TOOL_NAMES.YOUR_NEW_TOOL, 'hasResults', {
    fileCount: results.length,
    // ... other context
  }),
};
```

---

## Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| `tools/utils.ts` | Entry | `createSuccessResult()` - main tool entry point |
| `types/metadata.ts` | Types | HintContext, HintStatus, ToolHintGenerators |
| `tools/hints/index.ts` | Combiner | `getHints()` - combines static + dynamic |
| `tools/hints/types.ts` | Re-exports | Re-exports types from `types/metadata.ts` |
| `tools/hints/static.ts` | Loader | Loads from toolMetadata + `getMetadataDynamicHints()` |
| `tools/hints/dynamic.ts` | Generator | Context-aware HINTS object (all 13 tools) |
| `tools/hints/localBaseHints.ts` | Constants | Local tool base hints |
| `tools/toolMetadata.ts` | Remote | Fetches from API, caches |
| `utils/response/bulk.ts` | Aggregator | Deduplicates across bulk results |

**Flow**:
```
Tool → createSuccessResult(query, data, hasContent, toolName, { hintContext, extraHints })
                │
                ├── getHints(toolName, status, hintContext)
                │       ├── getStaticHints() ← Remote API (content.json)
                │       └── getDynamicHints() ← HINTS object
                │
                └── + extraHints (pagination, tool-specific)
                          │
                          ▼
                     Response.hints[]
```

---

*Created by Octocode MCP https://octocode.ai 🔍🐙*

