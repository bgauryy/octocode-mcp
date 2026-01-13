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

---

## Table of Contents

1. [Installation](#installation)
2. [When to Use](#when-to-use-this-skill)
3. [Quick Decision Guide](#quick-decision-guide)
4. [Available Functions](#available-functions)
5. [Usage Examples](#usage-examples)
6. [CLI Scripts](#cli-scripts)
7. [Response Format](#response-format)
8. [Critical Rules](#critical-rules)
9. [Full References](#full-references)

---

## Installation

Run the install script (installs dependencies + tsx globally):

```bash
cd skills/octocode-research
./install.sh
```

Or install manually:

```bash
yarn install           # from workspace root
yarn build             # build the package
npm install -g tsx     # for running CLI scripts
```

---

## When to Use This Skill

Use this skill when the user needs to:
- Search for code patterns in local or GitHub repositories
- Explore codebase structure and organization
- Find symbol definitions and references
- Trace function call hierarchies
- Research npm/PyPI packages

> ⚠️ **Important**: This skill provides **library functions** (not MCP tools). Import and call functions directly from `octocode-research`.

---

## Quick Decision Guide

```
Is it in YOUR codebase?
├── YES → Use LOCAL tools + LSP
│         ⚠️ For flows: lspCallHierarchy is MANDATORY
│
└── NO → Use GITHUB tools
         ├── Know package name? → packageSearch first
         └── Know repo? → githubViewRepoStructure → githubSearchCode
```

| Question | Function Chain | Full Reference |
|----------|----------------|----------------|
| "Where is X defined?" | `localSearchCode` → `lspGotoDefinition(lineHint)` | [lspGotoDefinition](./references/lspGotoDefinition.md) |
| "Who calls function X?" | `localSearchCode` → `lspCallHierarchy(incoming)` | [lspCallHierarchy](./references/lspCallHierarchy.md) |
| "What does X call?" | `localSearchCode` → `lspCallHierarchy(outgoing)` | [lspCallHierarchy](./references/lspCallHierarchy.md) |
| "All usages of type/var?" | `localSearchCode` → `lspFindReferences(lineHint)` | [lspFindReferences](./references/lspFindReferences.md) |
| "Find files by name" | `localFindFiles` | [localFindFiles](./references/localFindFiles.md) |
| "Project structure?" | `localViewStructure` | [localViewStructure](./references/localViewStructure.md) |
| "External package info?" | `packageSearch` → `githubViewRepoStructure` | [packageSearch](./references/packageSearch.md) |
| "Search GitHub code?" | `githubSearchCode(owner, repo, keywords)` | [githubSearchCode](./references/githubSearchCode.md) |

---

## Available Functions

> 📋 **Full Schemas**: Each function supports many parameters (pagination, filtering, context, etc.). Click the **Reference** link for complete `Input Type` and `Output Type` specifications.

### Local Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `localSearchCode` | Search code with ripgrep | [📖 Full Reference](./references/localSearchCode.md) |
| `localGetFileContent` | Read local file content | [📖 Full Reference](./references/localGetFileContent.md) |
| `localFindFiles` | Find files by metadata | [📖 Full Reference](./references/localFindFiles.md) |
| `localViewStructure` | View directory tree | [📖 Full Reference](./references/localViewStructure.md) |

### LSP Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `lspGotoDefinition` | Jump to symbol definition | [📖 Full Reference](./references/lspGotoDefinition.md) |
| `lspFindReferences` | Find all symbol usages | [📖 Full Reference](./references/lspFindReferences.md) |
| `lspCallHierarchy` | Trace call relationships | [📖 Full Reference](./references/lspCallHierarchy.md) |

### GitHub Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `githubSearchCode` | Search GitHub code | [📖 Full Reference](./references/githubSearchCode.md) |
| `githubGetFileContent` | Read GitHub files | [📖 Full Reference](./references/githubGetFileContent.md) |
| `githubSearchRepositories` | Find GitHub repos | [📖 Full Reference](./references/githubSearchRepositories.md) |
| `githubViewRepoStructure` | Explore repo structure | [📖 Full Reference](./references/githubViewRepoStructure.md) |
| `githubSearchPullRequests` | Search PR history | [📖 Full Reference](./references/githubSearchPullRequests.md) |

### Package Tools

| Function | Purpose | Reference |
|----------|---------|-----------|
| `packageSearch` | Search npm/PyPI | [📖 Full Reference](./references/packageSearch.md) |

---

## Usage Examples

> 💡 **Note**: These are **simplified examples** showing common usage patterns. For **complete parameter options**, see the [Full References](#full-references) section.

### Basic Import Pattern

```typescript
import { 
  localSearchCode, 
  lspGotoDefinition,
  githubSearchCode,
  initialize  // Required for GitHub tools
} from 'octocode-research';
```

### Example: Local Code Search

```typescript
// EXAMPLE: Basic search - see localSearchCode.md for all options
const result = await localSearchCode({
  queries: [{
    pattern: 'authenticate',
    path: '/project/src',
  }]
});
```
> 📖 **Full options**: [localSearchCode.md](./references/localSearchCode.md) - supports `contextLines`, `filesOnly`, `include/exclude`, pagination, etc.

### Example: LSP Definition Lookup

```typescript
// EXAMPLE: Go to definition - see lspGotoDefinition.md for all options
const def = await lspGotoDefinition({
  queries: [{
    uri: './src/index.ts',
    symbolName: 'myFunction',
    lineHint: 10,  // REQUIRED: from localSearchCode results
  }]
});
```
> 📖 **Full options**: [lspGotoDefinition.md](./references/lspGotoDefinition.md) - supports `contextLines`, `orderHint`, etc.

### Example: Call Hierarchy

```typescript
// EXAMPLE: Find who calls a function - see lspCallHierarchy.md for all options
const calls = await lspCallHierarchy({
  queries: [{
    uri: './src/api.ts',
    symbolName: 'processRequest',
    lineHint: 42,
    direction: 'incoming',  // or 'outgoing'
  }]
});
```
> 📖 **Full options**: [lspCallHierarchy.md](./references/lspCallHierarchy.md) - supports `depth`, `callsPerPage`, pagination, etc.

### Example: GitHub Search

```typescript
// EXAMPLE: Search GitHub - see githubSearchCode.md for all options
await initialize(); // Required first!

const code = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Find hooks implementation',
    researchGoal: 'Search useState patterns',
    reasoning: 'Understanding React hooks',
    keywordsToSearch: ['useState'],
    owner: 'facebook',
    repo: 'react',
  }]
});
```
> 📖 **Full options**: [githubSearchCode.md](./references/githubSearchCode.md) - supports `extension`, `path`, `filename`, `match` mode, etc.

### Example: Complete Research Flow

```typescript
// EXAMPLE: Full research workflow
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
  queries: [{ pattern: 'authenticate', path: '/project/src' }]
});
// Results: line 42 in /project/src/middleware/auth.ts

// Step 3: LSP - Go to definition
const definition = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/middleware/auth.ts',
    symbolName: 'authenticate',
    lineHint: 42,
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

## CLI Scripts

The `scripts/` folder contains runnable examples for each function.

### Running Scripts

```bash
cd skills/octocode-research

# Local tools
npx tsx scripts/localSearchCode.ts "pattern" ./src
npx tsx scripts/localGetFileContent.ts ./path/to/file.ts
npx tsx scripts/localFindFiles.ts . "*.ts"
npx tsx scripts/localViewStructure.ts ./src

# LSP tools
npx tsx scripts/lspGotoDefinition.ts ./src/file.ts symbolName 42
npx tsx scripts/lspFindReferences.ts ./src/file.ts symbolName 42
npx tsx scripts/lspCallHierarchy.ts ./src/file.ts symbolName 42 incoming

# GitHub tools (requires token)
npx tsx scripts/githubSearchCode.ts "keywords" owner/repo
npx tsx scripts/githubGetFileContent.ts owner/repo path/to/file.ts "matchString"
npx tsx scripts/githubSearchRepositories.ts "keywords"
npx tsx scripts/githubViewRepoStructure.ts owner/repo path branch
npx tsx scripts/githubSearchPullRequests.ts owner/repo "query" --merged

# Package search
npx tsx scripts/packageSearch.ts express npm
```

### Script to Function Mapping

| Script File | Function | Full Reference |
|-------------|----------|----------------|
| `scripts/localSearchCode.ts` | `localSearchCode` | [📖](./references/localSearchCode.md) |
| `scripts/localGetFileContent.ts` | `localGetFileContent` | [📖](./references/localGetFileContent.md) |
| `scripts/localFindFiles.ts` | `localFindFiles` | [📖](./references/localFindFiles.md) |
| `scripts/localViewStructure.ts` | `localViewStructure` | [📖](./references/localViewStructure.md) |
| `scripts/lspGotoDefinition.ts` | `lspGotoDefinition` | [📖](./references/lspGotoDefinition.md) |
| `scripts/lspFindReferences.ts` | `lspFindReferences` | [📖](./references/lspFindReferences.md) |
| `scripts/lspCallHierarchy.ts` | `lspCallHierarchy` | [📖](./references/lspCallHierarchy.md) |
| `scripts/githubSearchCode.ts` | `githubSearchCode` | [📖](./references/githubSearchCode.md) |
| `scripts/githubGetFileContent.ts` | `githubGetFileContent` | [📖](./references/githubGetFileContent.md) |
| `scripts/githubSearchRepositories.ts` | `githubSearchRepositories` | [📖](./references/githubSearchRepositories.md) |
| `scripts/githubViewRepoStructure.ts` | `githubViewRepoStructure` | [📖](./references/githubViewRepoStructure.md) |
| `scripts/githubSearchPullRequests.ts` | `githubSearchPullRequests` | [📖](./references/githubSearchPullRequests.md) |
| `scripts/packageSearch.ts` | `packageSearch` | [📖](./references/packageSearch.md) |

---

## Response Format

All functions return `CallToolResult`:

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

## Critical Rules

1. **LSP tools REQUIRE `lineHint`** - Always call `localSearchCode` first!
2. **Read file content LAST** - Use LSP for semantic understanding first
3. **GitHub: Use 1-2 filters max** - Never combine extension+filename+path
4. **`lspCallHierarchy` only works on functions** - Use `lspFindReferences` for types/variables
5. **Initialize token** - Call `initialize()` before GitHub tools

### Token Management

```typescript
import { initialize, getGitHubToken, getTokenSource } from 'octocode-research';

await initialize();
const token = await getGitHubToken();
const source = await getTokenSource();
// Returns: 'env:GH_TOKEN', 'env:GITHUB_TOKEN', 'gh-cli', 'octocode-storage', or 'none'
```

Token priority: `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` → Octocode storage

---

## Full References

### Research Methodology

| Prompt | Scope | Reference |
|--------|-------|-----------|
| **Local Research** | Local codebase with LSP semantic analysis | [📖 research_local_prompt.md](./references/research_local_prompt.md) |
| **External Research** | GitHub repos, packages, and PRs | [📖 research_external_prompt.md](./references/research_external_prompt.md) |

### Function References (Complete API Documentation)

#### Local Tools
- [localSearchCode.md](./references/localSearchCode.md) - Full search options
- [localGetFileContent.md](./references/localGetFileContent.md) - File reading options
- [localFindFiles.md](./references/localFindFiles.md) - File finding options
- [localViewStructure.md](./references/localViewStructure.md) - Structure viewing options

#### LSP Tools
- [lspGotoDefinition.md](./references/lspGotoDefinition.md) - Definition lookup options
- [lspFindReferences.md](./references/lspFindReferences.md) - Reference finding options
- [lspCallHierarchy.md](./references/lspCallHierarchy.md) - Call hierarchy options

#### GitHub Tools
- [githubSearchCode.md](./references/githubSearchCode.md) - Code search options
- [githubGetFileContent.md](./references/githubGetFileContent.md) - File content options
- [githubSearchRepositories.md](./references/githubSearchRepositories.md) - Repo search options
- [githubViewRepoStructure.md](./references/githubViewRepoStructure.md) - Structure options
- [githubSearchPullRequests.md](./references/githubSearchPullRequests.md) - PR search options

#### Package Tools
- [packageSearch.md](./references/packageSearch.md) - Package search options

---

## Exported Types

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
} from 'octocode-research';
```
