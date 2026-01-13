---
name: octocode-research
description: >-
  Research code in local and remote repositories using library functions.
  Use when users ask to search code, explore codebases, find definitions, 
  trace call hierarchies, or analyze GitHub repos. Trigger phrases: "find where", 
  "search for", "how is X used", "what calls", "explore the codebase", "look up package".
---

# Octocode Research Skill

Code research and discovery for local and remote codebases using library functions from `octocode-research` package.

## When to Use This Skill

Use this skill when the user needs to:
- Search for code patterns in local or GitHub repositories
- Explore codebase structure and organization
- Find symbol definitions and references
- Trace function call hierarchies
- Research npm/PyPI packages

## How It Works

This skill provides **library functions** (not MCP tools) that wrap the `octocode-mcp` execution layer. Import and call them directly:

```typescript
import { 
  localSearchCode, 
  lspGotoDefinition,
  githubSearchCode 
} from 'octocode-research';

const result = await localSearchCode({
  queries: [{
    pattern: 'authenticate',
    path: '/project/src',
  }]
});
```

## Available Functions

### Local Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `localSearchCode` | Search code with ripgrep | [📖 Reference](./references/localSearchCode.md) |
| `localGetFileContent` | Read local file content | [📖 Reference](./references/localGetFileContent.md) |
| `localFindFiles` | Find files by metadata | [📖 Reference](./references/localFindFiles.md) |
| `localViewStructure` | View directory tree | [📖 Reference](./references/localViewStructure.md) |

### LSP Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `lspGotoDefinition` | Jump to symbol definition | [📖 Reference](./references/lspGotoDefinition.md) |
| `lspFindReferences` | Find all symbol usages | [📖 Reference](./references/lspFindReferences.md) |
| `lspCallHierarchy` | Trace call relationships | [📖 Reference](./references/lspCallHierarchy.md) |

### GitHub Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `githubSearchCode` | Search GitHub code | [📖 Reference](./references/githubSearchCode.md) |
| `githubGetFileContent` | Read GitHub files | [📖 Reference](./references/githubGetFileContent.md) |
| `githubSearchRepositories` | Find GitHub repos | [📖 Reference](./references/githubSearchRepositories.md) |
| `githubViewRepoStructure` | Explore repo structure | [📖 Reference](./references/githubViewRepoStructure.md) |
| `githubSearchPullRequests` | Search PR history | [📖 Reference](./references/githubSearchPullRequests.md) |

### Package Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `packageSearch` | Search npm/PyPI | [📖 Reference](./references/packageSearch.md) |

---

## Research Prompts

For AI agents using this skill, we provide comprehensive research methodology prompts:

| Prompt | Scope | Reference |
|--------|-------|-----------|
| **Local Research** | Local codebase exploration with LSP semantic analysis | [📖 research_local_prompt.md](./references/research_local_prompt.md) |
| **External Research** | GitHub repos, packages, and PRs | [📖 research_external_prompt.md](./references/research_external_prompt.md) |

### What These Prompts Provide

- **research_local_prompt.md**: Complete guide for local code forensics. Covers the Funnel Method (DISCOVER → SEARCH → LSP → READ), trigger word detection for flow tracing, and anti-patterns to avoid. Critical for understanding when to use `lspCallHierarchy` vs file reading.

- **research_external_prompt.md**: Guide for GitHub-based research. Covers package discovery, repo exploration, code archaeology via PRs, and multi-agent parallelization strategies.

---

## TL;DR: Tools Usage Quick Guide

### 🏠 Local Research (Your Codebase)

```
Text narrows → Symbols identify → Graphs explain
```

| Task | Tool Chain |
|------|------------|
| **Find code** | `localSearchCode` |
| **Explore structure** | `localViewStructure` |
| **Go to definition** | `localSearchCode` → `lspGotoDefinition(lineHint)` |
| **Who calls X?** | `localSearchCode` → `lspCallHierarchy(incoming)` |
| **What does X call?** | `localSearchCode` → `lspCallHierarchy(outgoing)` |
| **All usages** | `localSearchCode` → `lspFindReferences(lineHint)` |
| **Read file (LAST)** | `localGetFileContent(matchString)` |

⚠️ **Critical**: For flow tracing, ALWAYS use LSP tools. Never read files to understand call relationships.

### 🌐 External Research (GitHub/Packages)

| Task | Tool Chain |
|------|------------|
| **Find package repo** | `packageSearch` → `githubViewRepoStructure` |
| **Search repo code** | `githubSearchCode(owner, repo, keywords)` |
| **Read GitHub file** | `githubGetFileContent(matchString)` |
| **Find repos** | `githubSearchRepositories(topics/keywords)` |
| **Code archaeology** | `githubSearchPullRequests(merged=true)` |

⚠️ **Critical**: Always narrow to `owner/repo` first. Use 1-2 filters max in `githubSearchCode`.

### 🔀 Combined Research (Local + External)

| Scenario | Flow |
|----------|------|
| **Understand imported package** | Local: find import → `packageSearch` → `githubViewRepoStructure` → `githubGetFileContent` |
| **Compare implementations** | Local: `lspGotoDefinition` → GitHub: `githubSearchCode(same pattern)` |
| **Find why code was written** | Local: identify code → GitHub: `githubSearchPullRequests(query, merged=true)` |
| **Trace cross-repo flow** | Local: `lspCallHierarchy` → at boundary → GitHub: `githubSearchCode` |

### Quick Decision Tree

```
Is it in YOUR codebase?
├── YES → Use LOCAL tools + LSP
│         ⚠️ For flows: lspCallHierarchy is MANDATORY
│
└── NO → Use GITHUB tools
         ├── Know package name? → packageSearch first
         └── Know repo? → githubViewRepoStructure → githubSearchCode
```

## Direct Function Calls

All functions are imported from `octocode-research` and called with `{ queries: [...] }`:

### Local Tools

```typescript
import { localSearchCode, localGetFileContent, localFindFiles, localViewStructure } from 'octocode-research';

// Search code
const search = await localSearchCode({
  queries: [{ pattern: 'export function', path: './src' }]
});

// Read file with match
const content = await localGetFileContent({
  queries: [{ path: './src/index.ts', matchString: 'export', matchStringContextLines: 10 }]
});

// Find files
const files = await localFindFiles({
  queries: [{ path: '.', name: '*.ts', type: 'f' }]
});

// View structure
const structure = await localViewStructure({
  queries: [{ path: '/project', depth: 2 }]
});
```

### LSP Tools (require lineHint from search)

```typescript
import { lspGotoDefinition, lspFindReferences, lspCallHierarchy } from 'octocode-research';

// Go to definition
const def = await lspGotoDefinition({
  queries: [{ uri: './src/index.ts', symbolName: 'myFunction', lineHint: 10 }]
});

// Find references
const refs = await lspFindReferences({
  queries: [{ uri: './src/types.ts', symbolName: 'UserConfig', lineHint: 5 }]
});

// Call hierarchy
const calls = await lspCallHierarchy({
  queries: [{ uri: './src/api.ts', symbolName: 'processRequest', lineHint: 42, direction: 'incoming' }]
});
```

### GitHub Tools (require token initialization)

```typescript
import { initialize, githubSearchCode, githubGetFileContent, githubSearchRepositories, githubViewRepoStructure, githubSearchPullRequests, packageSearch } from 'octocode-research';

await initialize(); // Required first!

// Search GitHub code
const code = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find hooks', researchGoal: 'Search useState', reasoning: 'Understanding hooks',
    keywordsToSearch: ['useState'], owner: 'facebook', repo: 'react',
  }]
});

// Read GitHub file
const file = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read source', researchGoal: 'Get README', reasoning: 'Documentation',
    owner: 'facebook', repo: 'react', path: 'README.md', fullContent: true,
  }]
});

// Search repositories
const repos = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Find tools', researchGoal: 'TypeScript CLIs', reasoning: 'Research',
    topicsToSearch: ['typescript', 'cli'], stars: '>1000',
  }]
});

// View repo structure
const struct = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Explore repo', researchGoal: 'View lib', reasoning: 'Find source',
    owner: 'expressjs', repo: 'express', branch: 'main', path: 'lib',
  }]
});

// Search PRs
const prs = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'Code archaeology', researchGoal: 'Find hooks PRs', reasoning: 'History',
    owner: 'facebook', repo: 'react', query: 'hooks', state: 'closed', merged: true,
  }]
});

// Package search
const pkg = await packageSearch({
  queries: [{
    mainResearchGoal: 'Find package', researchGoal: 'Get express repo', reasoning: 'Source exploration',
    name: 'express', ecosystem: 'npm',
  }]
});
```

---

## Response Format

All functions return `CallToolResult` with YAML-formatted content:

```typescript
interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}
```

The `text` field contains YAML with:
- `status`: `"hasResults"` | `"empty"` | `"error"`
- `data`: Query-specific result data
- `hints`: Context-aware next-step guidance

---

## Research Workflow

Follow the **Funnel Method** - progressive narrowing:

```
1. DISCOVERY → 2. SEARCH → 3. LSP SEMANTIC → 4. READ
     ↓              ↓              ↓              ↓
  Structure     Pattern        Locate/       Implementation
  & Scope      Matching       Analyze        Details (LAST!)
```

### Example: "Where is authentication handled?"

```typescript
import {
  localViewStructure,
  localSearchCode,
  lspGotoDefinition,
  localGetFileContent
} from 'octocode-research';

// Step 1: DISCOVERY - Understand structure
const structure = await localViewStructure({
  queries: [{ path: '/project/src', depth: 2 }]
});

// Step 2: SEARCH - Find patterns, get lineHint
const search = await localSearchCode({
  queries: [{ pattern: 'authenticate|auth', path: '/project/src' }]
});
// Results: line 42 in /project/src/middleware/auth.ts

// Step 3: LSP - Go to definition
const definition = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/middleware/auth.ts',
    symbolName: 'authenticate',
    lineHint: 42,  // From search!
  }]
});

// Step 4: READ - Only after locating (LAST step!)
const content = await localGetFileContent({
  queries: [{
    path: '/project/src/middleware/auth.ts',
    startLine: 40,
    endLine: 80,
  }]
});
```

---

## Tool Selection Quick Reference

| Question | Function Chain |
|----------|----------------|
| "Where is X defined?" | `localSearchCode` → `lspGotoDefinition(lineHint)` |
| "Who calls function X?" | `localSearchCode` → `lspCallHierarchy(incoming, lineHint)` |
| "What does X call?" | `localSearchCode` → `lspCallHierarchy(outgoing, lineHint)` |
| "All usages of type/var X?" | `localSearchCode` → `lspFindReferences(lineHint)` |
| "Find files by name" | `localFindFiles` |
| "Project structure?" | `localViewStructure` |
| "External package info?" | `packageSearch` → `githubViewRepoStructure` → `githubSearchCode` |
| "Why was code written?" | `githubSearchPullRequests(merged=true)` |

---

## Exported Types

Import types for TypeScript usage:

```typescript
import type {
  // Local tools
  RipgrepSearchQuery, SearchContentResult,
  FetchContentQuery, FetchContentResult,
  FindFilesQuery, FindFilesResult,
  ViewStructureQuery, ViewStructureResult,
  
  // LSP tools
  LSPGotoDefinitionQuery, GotoDefinitionResult,
  LSPFindReferencesQuery, FindReferencesResult,
  LSPCallHierarchyQuery, CallHierarchyResult,
  
  // GitHub tools
  GitHubCodeSearchQuery, SearchResult,
  FileContentQuery, ContentResult,
  GitHubReposSearchQuery, RepoSearchResult,
  GitHubViewRepoStructureQuery, RepoStructureResult,
  GitHubPullRequestSearchQuery, PullRequestSearchResult,
  
  // Package search
  PackageSearchQuery, PackageSearchResult,
  NpmPackageSearchQuery, PythonPackageSearchQuery,
} from 'octocode-research';
```

---

## Token Management

For GitHub tools, initialize token resolution:

```typescript
import { initialize, getGitHubToken, getTokenSource } from 'octocode-research';

await initialize();
const token = await getGitHubToken();
const source = await getTokenSource();
// Returns: 'env:GH_TOKEN', 'env:GITHUB_TOKEN', 'gh-cli', 'octocode-storage', or 'none'
```

Token priority:
1. `GH_TOKEN` env var
2. `GITHUB_TOKEN` env var
3. `gh auth token` (GitHub CLI)
4. Octocode secure storage

---

## Critical Rules

1. **LSP tools REQUIRE `lineHint`** - Always call `localSearchCode` first!
2. **Read file content LAST** - Use LSP for semantic understanding first
3. **GitHub: Use 1-2 filters max** - Never combine extension+filename+path
4. **`lspCallHierarchy` only works on functions** - Use `lspFindReferences` for types/variables
5. **Initialize token** - Call `initialize()` before GitHub tools

---

## References

For detailed API documentation for each function, see the `references/` folder:

### Research Methodology Prompts
- [research_local_prompt.md](./references/research_local_prompt.md) - Local codebase research with LSP
- [research_external_prompt.md](./references/research_external_prompt.md) - GitHub/package research

### Tool References
- [localSearchCode](./references/localSearchCode.md)
- [localGetFileContent](./references/localGetFileContent.md)
- [localFindFiles](./references/localFindFiles.md)
- [localViewStructure](./references/localViewStructure.md)
- [lspGotoDefinition](./references/lspGotoDefinition.md)
- [lspFindReferences](./references/lspFindReferences.md)
- [lspCallHierarchy](./references/lspCallHierarchy.md)
- [githubSearchCode](./references/githubSearchCode.md)
- [githubGetFileContent](./references/githubGetFileContent.md)
- [githubSearchRepositories](./references/githubSearchRepositories.md)
- [githubViewRepoStructure](./references/githubViewRepoStructure.md)
- [githubSearchPullRequests](./references/githubSearchPullRequests.md)
- [packageSearch](./references/packageSearch.md)
