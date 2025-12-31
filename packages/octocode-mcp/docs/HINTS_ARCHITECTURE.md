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
    │  Tool Files     │ │ bulkOps.ts  │ │   utils.ts      │
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
│   │   ├── types.ts             # HintContext, HintStatus, HintGenerator
│   │   ├── static.ts            # Loads from toolMetadata
│   │   └── dynamic.ts           # Context-aware HINTS object (all 10 tools)
│   │
│   ├── utils.ts                 # 🎯 createSuccessResult() - MAIN ENTRY POINT
│   ├── toolMetadata.ts          # Fetches remote JSON, exports getToolHintsSync
│   ├── toolNames.ts             # STATIC_TOOL_NAMES constants
│   │
│   ├── local_ripgrep.ts         # Uses createSuccessResult()
│   ├── local_fetch_content.ts   # Uses createSuccessResult()
│   ├── local_view_structure.ts  # Uses createSuccessResult()
│   ├── local_find_files.ts      # Uses createSuccessResult()
│   ├── github_*.ts              # Uses createSuccessResult()
│   └── package_search.ts        # Uses createSuccessResult()
│
└── utils/
    ├── bulkOperations.ts        # Aggregates hints across bulk results
    └── errorResult.ts           # Error hints handling
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
  fileSize?: number;           // File size in bytes
  resultSize?: number;         // Result size
  tokenEstimate?: number;      // Estimated tokens
  entryCount?: number;         // Directory entries
  matchCount?: number;         // Search matches
  fileCount?: number;          // Files found
  isLarge?: boolean;           // Large file/result flag
  errorType?: 'size_limit' | 'not_found' | 'permission' | 'pattern_too_broad';
  originalError?: string;
  hasPattern?: boolean;        // Has matchString
  hasPagination?: boolean;     // Using pagination
  path?: string;
  hasOwnerRepo?: boolean;      // GitHub: has owner/repo
  match?: 'file' | 'path';     // GitHub: search mode
  searchEngine?: 'rg' | 'grep'; // Local: which engine
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

// toolMetadata.ts
export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  const baseHints = METADATA_JSON.baseHints[resultType] ?? [];
  const toolHints = METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}
```

### Step 4: Dynamic hints from context

```typescript
// hints/dynamic.ts
export const HINTS: Record<string, ToolHintGenerators> = {
  [STATIC_TOOL_NAMES.LOCAL_RIPGREP]: {
    hasResults: (ctx: HintContext = {}) => [
      ctx.searchEngine === 'grep'
        ? 'Using grep fallback - install ripgrep for best performance.'
        : undefined,
      'Next: localGetFileContent for context (prefer matchString).',
      'Also search imports/usages/defs with localSearchCode.',
      ctx.fileCount && ctx.fileCount > 5
        ? 'Tip: run queries in parallel.'
        : undefined,
    ],
    empty: (ctx: HintContext = {}) => [
      ctx.searchEngine === 'grep'
        ? 'Using grep fallback - note: grep does not respect .gitignore.'
        : undefined,
      'No matches. Broaden scope (noIgnore, hidden) or use fixedString.',
      'Unsure of paths? localViewStructure or localFindFiles.',
    ],
    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
          'Add type/path filters to focus.',
          'Names only? Use localFindFiles.',
        ];
      }
      return ['Tool unavailable; try localFindFiles or localViewStructure.'];
    },
  },
  // ... other tools ...
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

---

## Bulk Operations Aggregation

When tools return multiple results (bulk queries), hints are aggregated:

```typescript
// utils/bulkOperations.ts
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

### LOCAL_RIPGREP
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `searchEngine === 'grep'` | Grep fallback warning |
| hasResults | `fileCount > 5` | Parallel queries tip |
| hasResults | always | Next tool suggestions |
| empty | `searchEngine === 'grep'` | Grep doesn't respect .gitignore |
| empty | always | Broaden scope suggestion |
| error | `errorType === 'size_limit'` | Too many results, narrow scope |

### LOCAL_FETCH_CONTENT
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | always | Trace imports, prefer matchString |
| empty | always | Check path/pattern |
| error | `errorType === 'size_limit' && isLarge` | Large file, use matchString |
| error | `errorType === 'pattern_too_broad'` | Pattern too broad |

### LOCAL_VIEW_STRUCTURE
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `entryCount > 10` | Parallelize across directories |
| hasResults | always | Next tool suggestions |
| empty | always | Use hidden=true |
| error | `errorType === 'size_limit'` | Large directory, use pagination |

### LOCAL_FIND_FILES
| Status | Context Check | Hint |
|--------|---------------|------|
| hasResults | `fileCount > 3` | Batch in parallel |
| hasResults | `fileCount > 20` | Additional hints from metadata |
| empty | always | Broaden filters |
| error | always | Try alternative tools |

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

Edit `hints/dynamic.ts`:

```typescript
export const HINTS: Record<string, ToolHintGenerators> = {
  // ...existing tools...
  
  [STATIC_TOOL_NAMES.YOUR_NEW_TOOL]: {
    hasResults: (ctx: HintContext = {}) => [
      ctx.someCondition ? 'Conditional hint' : undefined,
      'Always shown hint',
    ],
    empty: (ctx: HintContext = {}) => [
      'Recovery suggestion',
    ],
    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return ['Size limit hint'];
      }
      return ['General error hint'];
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
| `utils.ts` | Entry | `createSuccessResult()` - main tool entry point |
| `hints/types.ts` | Types | HintContext, HintStatus, HintGenerator |
| `hints/index.ts` | Combiner | `getHints()` - combines static + dynamic |
| `hints/static.ts` | Loader | Loads from toolMetadata |
| `hints/dynamic.ts` | Generator | Context-aware HINTS object (all 10 tools) |
| `toolMetadata.ts` | Remote | Fetches from API, caches |
| `bulkOperations.ts` | Aggregator | Deduplicates across bulk results |

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

